import { describe, expect, it } from "vitest";
import { burst, call } from "./helpers";

// These tests never launch a real browser: they only check what happens
// before puppeteer is called. Browser time is too scarce to spend in CI.
describe("Browser Run", () => {
  it.each(["/browser/screenshot", "/browser/pdf", "/browser/inspect"])("%s rejects missing or non-http URLs", async (path) => {
    expect((await call(path)).status).toBe(400);
    expect((await call(`${path}?url=${encodeURIComponent("file:///etc/passwd")}`)).status).toBe(400);
  });

  it("counts browser requests toward the write limiter", async () => {
    // Invalid URLs return 400 without using a browser, but still use up the limit.
    const { firstWindow, blocked } = await burst(30, () => call("/browser/screenshot?url=nope", {}, "203.0.113.9"));
    expect(firstWindow.every((s) => s === 400)).toBe(true);
    expect(blocked).toBeGreaterThan(0);
  });
});
