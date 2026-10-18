import type { Page } from "@playwright/test";
import { features } from "../src/features";

export const PAGES = ["/", ...features.filter((f) => f.ready).map((f) => `/${f.slug}`)];

/** True when testing the live site (BASE_URL set) rather than the local E2E build. */
export const LIVE = !!process.env.BASE_URL;

/**
 * Collects uncaught exceptions, console errors (CSP violations included) and
 * failed requests from the lab's own page. Frames from other origins are left
 * out: Cloudflare's Turnstile iframe has its own CSP and logs its own noise
 * (Private Access Token 401s, blocked probes). The browser's "Failed to load
 * resource" message has no URL, so failed requests come from the responses.
 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  const ours = (url: string) => url === "" || new URL(url).origin === new URL(page.url() || "http://x").origin;
  page.on("pageerror", (e) => errors.push(`exception: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() < 400 || r.request().frame() !== page.mainFrame()) return;
    errors.push(`${r.status()}: ${new URL(r.url()).pathname}`);
  });
  page.on("console", (m) => {
    if (m.type() !== "error" || m.text().startsWith("Failed to load resource")) return;
    if (!ours(m.location().url)) return;
    errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Scrolls to the bottom and waits for the page's API calls to settle. */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  // Bounded: Turnstile's widget keeps a connection open, so some pages never
  // go fully idle.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * How far the page is wider than the device. Not scrollWidth - innerWidth:
 * on a phone the browser widens its layout viewport to fit too-wide content,
 * which would hide the very overflow being measured.
 */
export async function overflow(page: Page) {
  const width = page.viewportSize()!.width;
  return (await page.evaluate(() => document.documentElement.scrollWidth)) - width;
}
