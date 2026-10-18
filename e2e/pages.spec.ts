import { expect, test } from "@playwright/test";
import { LIVE, overflow, PAGES, settle, watchErrors } from "./helpers";

// Failed requests that are correct behaviour, each allowed only on its page.
const EXPECTED: Record<string, string[]> = {
  // The inbox is admin-only: anonymous visitors get 401 (the page shows the count only).
  "/email": ["401: /api/email/messages"],
  // The local E2E build has no Neon database and no remote Vectorize index.
  ...(LIVE ? {} : {
    "/hyperdrive": ["500: /api/hyperdrive/products"],
    "/vectorize": ["500: /api/vectorize/info"],
  }),
};

// Every page, on desktop and on a phone: the SPA route renders, its API calls
// succeed, nothing throws or gets blocked by the CSP, and nothing is wider
// than the screen. Read-only: loading a page writes nothing.
for (const path of PAGES) {
  test(`${path} loads cleanly @readonly`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await settle(page);
    expect(errors.filter((e) => !EXPECTED[path]?.includes(e))).toEqual([]);
    expect(await overflow(page), "page is wider than the screen").toBeLessThanOrEqual(0);
  });
}
