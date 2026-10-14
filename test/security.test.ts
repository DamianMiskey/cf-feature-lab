import { describe, expect, it } from "vitest";
import { isPublicHost } from "../worker/routes/browser";
import { call } from "./helpers";

describe("Security headers on API responses", () => {
  it("sets nosniff, frame, referrer and a lock-everything CSP", async () => {
    const res = await call("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
  });
});

describe("SSRF protection for Browser Run", () => {
  it.each([
    "localhost", "printer.local", "db.internal", "127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "[::1]", "fd00::1", "fe80::1",
  ])("blocks %s", (host) => expect(isPublicHost(host)).toBe(false));

  it.each(["example.com", "developers.cloudflare.com", "1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])(
    "allows %s", (host) => expect(isPublicHost(host)).toBe(true),
  );

  it("rejects private targets before launching a browser, including disguised ones", async () => {
    for (const url of ["http://127.0.0.1", "http://2130706433", "http://0x7f.0.0.1", "http://169.254.169.254/latest/meta-data/"]) {
      expect((await call(`/browser/inspect?url=${encodeURIComponent(url)}`)).status).toBe(400);
    }
  });
});

describe("R2 upload allow-list", () => {
  it("refuses SVG (it can carry scripts)", async () => {
    const res = await call("/r2/evil.svg", { method: "PUT", body: "<svg onload='alert(1)'/>", headers: { "content-type": "image/svg+xml" } });
    expect(res.status).toBe(415);
  });

  it("refuses HTML", async () => {
    expect((await call("/r2/page.html", { method: "PUT", body: "<script>alert(1)</script>", headers: { "content-type": "text/html" } })).status).toBe(415);
  });

  it("serves text as a download and images inline", async () => {
    await call("/r2/notes.txt", { method: "PUT", body: "hello", headers: { "content-type": "text/plain" } });
    expect((await call("/r2/notes.txt")).headers.get("content-disposition")).toContain("attachment");

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await call("/r2/pixel.png", { method: "PUT", body: png, headers: { "content-type": "image/png" } });
    const img = await call("/r2/pixel.png");
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-disposition")).toBeNull();
  });
});
