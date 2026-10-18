import { expect, test } from "@playwright/test";
import { PAGES } from "./helpers";

// public/_headers for the app, Hono's secureHeaders() for the API: checked on
// real responses from the built Worker (locally) or the live site.

test.describe("security headers @readonly", () => {
  for (const path of PAGES) {
    test(`${path}`, async ({ request }) => {
      const h = (await request.get(path)).headers();
      const csp = h["content-security-policy"];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com;");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toMatch(/'unsafe-(eval|inline)'[^;]*;.*script|script-src[^;]*'unsafe-/);
      expect(h["strict-transport-security"]).toContain("max-age=31536000");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["cache-control"]).toContain("no-transform");
    });
  }

  test("API responses get a locked-down CSP of their own", async ({ request }) => {
    const res = await request.get("/api/basics/inspect");
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("hashed build files are cached for a year", async ({ page, request }) => {
    await page.goto("/");
    const script = await page.locator("script[src^='/assets/']").first().getAttribute("src");
    expect((await request.get(script!)).headers()["cache-control"]).toContain("immutable");
  });
});

test.describe("routing @readonly", () => {
  test("unknown app routes fall back to the SPA (deep links work)", async ({ request }) => {
    const res = await request.get("/this-page-does-not-exist");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<div id="root"');
  });

  test("unknown API routes are a JSON 404, not the SPA", async ({ request }) => {
    const res = await request.get("/api/does-not-exist");
    expect(res.status()).toBe(404);
  });

  test("admin-only routes fail closed without a token", async ({ request }) => {
    expect([401, 503]).toContain((await request.get("/api/security/admin")).status());
    expect([401, 503]).toContain((await request.get("/api/email/messages")).status());
  });
});

// Only the real zone (djmiskey.com) has these: WAF, HTTPS redirect, Access.
test.describe("on Cloudflare @deployed", () => {
  test("the WAF blocks scanner paths", async ({ request }) => {
    for (const path of ["/.env", "/wp-admin", "/.git/config"]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
    }
  });

  test("plain HTTP is redirected to HTTPS", async ({ request }) => {
    const res = await request.get("http://lab.djmiskey.com/basics", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers().location).toBe("https://lab.djmiskey.com/basics");
  });

  test("traffic goes through Cloudflare with modern TLS", async ({ request }) => {
    const res = await request.get("/cdn-cgi/trace");
    expect(res.headers()["cf-ray"] ?? (await request.get("/")).headers()["cf-ray"]).toBeTruthy();
    const trace = await res.text();
    expect(trace).toMatch(/tls=TLSv1\.[23]/);
  });

  test("admin.djmiskey.com asks for an Access login first", async ({ request }) => {
    const res = await request.get("https://admin.djmiskey.com/", { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toContain("cloudflareaccess.com");
  });
});
