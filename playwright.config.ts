import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (e2e/). By default they build the lab in E2E mode and run
// it with `vite preview`: the real Worker in workerd, with its own local
// KV/D1/R2/DO storage (.wrangler/e2e-state), and no remote bindings, so
// nothing reaches the Cloudflare account, Workers AI or Neon. Tests may write
// there. Set BASE_URL to test the live site instead; then only read-only
// tests run, plus the ones tagged @deployed:
//   BASE_URL=https://lab.djmiskey.com npm run e2e
// Locally the browser is the installed Microsoft Edge; CI installs Chromium.
const CI = !!process.env.CI;
const LIVE = !!process.env.BASE_URL;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4317";
const channel = CI ? undefined : "msedge";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  // Over the network a request can blip; a test that only passes on its
  // retry is still reported as "flaky", not hidden.
  retries: CI || LIVE ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  // Live: only read-only tests and @deployed ones. Local: everything else.
  grep: LIVE ? /@readonly|@deployed/ : undefined,
  grepInvert: LIVE ? undefined : /@deployed/,
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, testMatch: /pages\.spec/ },
  ],
  webServer: LIVE
    ? undefined
    : { command: "npm run e2e:server", url: BASE_URL, reuseExistingServer: !CI, timeout: 180_000 },
});
