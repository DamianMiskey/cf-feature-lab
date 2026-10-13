import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { Hono } from "hono";

const browserRoutes = new Hono<{ Bindings: Env }>();

// page.evaluate() callbacks run inside the browser, where `document` exists.
// The Worker has no DOM types, so declare just enough for that callback.
type El = { tagName: string; textContent: string | null; getAttribute(name: string): string | null };
declare const document: {
  title: string;
  images: { length: number };
  scripts: { length: number };
  body: { innerText: string };
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): ArrayLike<El> & Iterable<El>;
};

// Only render public http(s) pages.
function targetUrl(raw: string | undefined) {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// Launching a browser takes a few seconds. Reconnecting to one that's already
// running takes a fraction of that. So: look for an idle session first, and
// when finished, disconnect() rather than close() so the browser stays warm
// (for keep_alive ms) for the next request.
//
// The free plan also limits how often you can launch a new browser, and
// `limits()` can lag right after a launch. So: if a session exists but is
// still busy (it was usually just disconnected), wait a few seconds for it
// rather than launching. If a launch is refused with 429, wait and try again.
async function getBrowser(env: Env): Promise<{ browser: Browser; reused: boolean; startMs: number }> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  while (elapsed() < 12_000) {
    const sessions = await puppeteer.sessions(env.BROWSER);
    for (const session of sessions.filter((s) => !s.connectionId)) {
      try {
        const browser = await puppeteer.connect(env.BROWSER, session.sessionId);
        return { browser, reused: true, startMs: elapsed() };
      } catch {
        // Another request grabbed it first. Try the next one.
      }
    }

    const waitForBusySession = sessions.length > 0 && elapsed() < 5_000;
    if (!waitForBusySession) {
      try {
        const browser = await puppeteer.launch(env.BROWSER, { keep_alive: 60_000 });
        return { browser, reused: false, startMs: elapsed() };
      } catch (e) {
        if (!String(e).includes("429")) throw e;
        // Launch limit hit: fall through and retry shortly.
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No browser available right now (free plan: limited concurrent browsers and launches). Try again in a few seconds.");
}

// Open a page, run `fn`, and always release the browser afterwards.
async function withPage<T>(env: Env, url: URL, width: number, fn: (page: Awaited<ReturnType<Browser["newPage"]>>) => Promise<T>) {
  const { browser, reused, startMs } = await getBrowser(env);
  const sessionId = browser.sessionId();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: Math.round(width * 0.625) });
    const navStarted = Date.now();
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout: 20_000 });
    const result = await fn(page);
    await page.close();
    return { result, meta: { sessionId, reused, browserStartMs: startMs, pageLoadMs: Date.now() - navStarted } };
  } finally {
    browser.disconnect();
  }
}

const metaHeaders = (meta: Record<string, string | number | boolean>) =>
  Object.fromEntries(Object.entries(meta).map(([k, v]) => [`x-browser-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, String(v)]));

// Screenshot, cached for 10 minutes per URL + width + fullPage.
browserRoutes.get("/screenshot", async (c) => {
  const url = targetUrl(c.req.query("url"));
  if (!url) return c.json({ error: "Pass ?url=https://…" }, 400);
  const width = Math.min(Math.max(Number(c.req.query("w")) || 1280, 320), 1920);
  const fullPage = c.req.query("full") === "1";

  const cacheKey = new Request(`https://cache.lab/screenshot?u=${encodeURIComponent(url.toString())}&w=${width}&f=${fullPage}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("x-cache", "HIT");
    return res;
  }

  const { result: png, meta } = await withPage(c.env, url, width, (page) => page.screenshot({ type: "png", fullPage }));
  const res = new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=600", ...metaHeaders(meta) },
  });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, res.clone()));
  res.headers.set("x-cache", "MISS");
  return res;
});

browserRoutes.get("/pdf", async (c) => {
  const url = targetUrl(c.req.query("url"));
  if (!url) return c.json({ error: "Pass ?url=https://…" }, 400);
  const { result: pdf, meta } = await withPage(c.env, url, 1280, (page) =>
    page.pdf({ format: "A4", printBackground: true, margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" } }),
  );
  return new Response(pdf, {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${url.hostname}.pdf"`, ...metaHeaders(meta) },
  });
});

// Scrape: run JavaScript inside the page and return what it finds.
browserRoutes.get("/inspect", async (c) => {
  const url = targetUrl(c.req.query("url"));
  if (!url) return c.json({ error: "Pass ?url=https://…" }, 400);
  const { result, meta } = await withPage(c.env, url, 1280, (page) =>
    // This function runs in the browser, not the Worker, so it can use the DOM.
    page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      headings: [...document.querySelectorAll("h1, h2")].slice(0, 8).map((h) => `${h.tagName}: ${h.textContent?.trim().slice(0, 80)}`),
      links: document.querySelectorAll("a[href]").length,
      images: document.images.length,
      scripts: document.scripts.length,
      words: document.body.innerText.split(/\s+/).filter(Boolean).length,
    })),
  );
  return c.json({ url: url.toString(), ...result, ...meta });
});

// Account limits and sessions currently open. These calls don't use browser time.
browserRoutes.get("/status", async (c) => {
  const [limits, sessions] = await Promise.all([puppeteer.limits(c.env.BROWSER), puppeteer.sessions(c.env.BROWSER)]);
  return c.json({ limits, sessions });
});

export default browserRoutes;
