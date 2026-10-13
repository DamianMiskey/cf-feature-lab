import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/browser.ts?raw";

type Status = { limits: { maxConcurrentSessions: number; allowedBrowserAcquisitions: number; timeUntilNextAllowedBrowserAcquisition: number; usedBrowserTimeSeconds?: number }; sessions: { sessionId: string; connectionId?: string }[] };
type Inspect = { title: string; description: string | null; headings: string[]; links: number; images: number; words: number; reused: boolean; browserStartMs: number; pageLoadMs: number };

export function BrowserRun() {
  const [url, setUrl] = useState("https://example.com");
  const [width, setWidth] = useState(1280);
  const [fullPage, setFullPage] = useState(false);
  const [shot, setShot] = useState<{ src: string; reused: string | null; startMs: string | null; loadMs: string | null; cache: string | null } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadStatus = () => api<Status>("/browser/status").then(setStatus).catch(() => {});
  useEffect(() => { loadStatus(); }, []);

  const run = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    setBusy(""); loadStatus();
  };

  const screenshot = run("shot", async () => {
    const res = await fetch(`/api/browser/screenshot?url=${encodeURIComponent(url)}&w=${width}&full=${fullPage ? 1 : 0}`);
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    if (shot) URL.revokeObjectURL(shot.src);
    setShot({
      src: URL.createObjectURL(await res.blob()),
      reused: res.headers.get("x-browser-reused"),
      startMs: res.headers.get("x-browser-browser-start-ms"),
      loadMs: res.headers.get("x-browser-page-load-ms"),
      cache: res.headers.get("x-cache"),
    });
  });
  const doInspect = run("inspect", async () => setInspect(await api<Inspect>(`/browser/inspect?url=${encodeURIComponent(url)}`)));

  return (
    <FeaturePage
      title="Browser Run"
      tagline="Headless Chrome on Cloudflare's network, driven from a Worker. (Formerly called Browser Rendering.)"
      docs="https://developers.cloudflare.com/browser-rendering/"
      whatItIs={<p>
        The <code>browser</code> binding gives your Worker a real Chrome browser. With <code>@cloudflare/puppeteer</code>
        (or Playwright) you open pages, wait for JavaScript, click, type, and take <strong>screenshots</strong>, make
        <strong> PDFs</strong>, or <strong>scrape</strong> content by running code inside the page. Starting a browser takes a few seconds, so this Worker
        <code> disconnect()</code>s instead of closing and reuses warm sessions. Free plan: 10 browser-minutes per day,
        and only one new browser launch at a time.
      </p>}
      whenToUse={[
        "Screenshots and social-card images of web pages",
        "PDF invoices, reports and tickets from HTML",
        "Scraping JavaScript-heavy sites, end-to-end checks, and giving AI agents a browser",
      ]}
    >
      {error && <p className="error">{error}</p>}
      <Demo title="Pick a page">
        <div className="form-row">
          <label className="grow">URL<input value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label>Width: {width}px<input type="range" min={320} max={1920} step={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={fullPage} onChange={(e) => setFullPage(e.target.checked)} /> Full page</label>
        </div>
        <div className="form-row">
          <button onClick={screenshot} disabled={!!busy}>{busy === "shot" ? "Rendering…" : "Screenshot"}</button>
          <button className="ghost" onClick={doInspect} disabled={!!busy}>{busy === "inspect" ? "Inspecting…" : "Scrape page info"}</button>
          <a className="docs" href={`/api/browser/pdf?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Open as PDF ↗</a>
        </div>
        <p className="small muted">Each render uses a few seconds of browser time and counts toward the lab's 30-per-minute limit. Screenshots are cached for 10 minutes.</p>
      </Demo>

      {shot && (
        <Demo title="Screenshot">
          <p className="small">
            {shot.cache === "HIT"
              ? <>Served from the <strong>cache</strong>, so no browser was used.</>
              : <>Browser <strong>{shot.reused === "true" ? "reused (warm)" : "launched (cold)"}</strong> in {shot.startMs} ms · page loaded in {shot.loadMs} ms</>}
          </p>
          <img className="transformed" src={shot.src} alt={`Screenshot of ${url}`} />
        </Demo>
      )}

      {inspect && (
        <Demo title="Scraped with page.evaluate()">
          <p className="small">Browser <strong>{inspect.reused ? "reused (warm)" : "launched (cold)"}</strong> in {inspect.browserStartMs} ms · page loaded in {inspect.pageLoadMs} ms</p>
          <JsonView value={inspect} />
        </Demo>
      )}

      <Demo title="Sessions & limits">
        <p>From <code>puppeteer.limits()</code> and <code>puppeteer.sessions()</code>. These calls are free. A session with no <code>connectionId</code> is a warm, idle browser waiting to be reused.</p>
        <button className="ghost" onClick={loadStatus}>Refresh</button>
        {status && <JsonView value={status} />}
      </Demo>

      <CodePeek file="worker/routes/browser.ts" source={source} />
    </FeaturePage>
  );
}
