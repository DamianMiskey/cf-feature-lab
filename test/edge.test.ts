import { describe, expect, it } from "vitest";
import { call } from "./helpers";

describe("Cache API", () => {
  it("misses, then hits, then misses again after a purge", async () => {
    const first = await call("/cache/item?item=test");
    expect(first.headers.get("x-cache")).toBe("MISS");
    const firstBody = await first.json();

    // The cache write happens in waitUntil(), so give it a moment.
    await new Promise((r) => setTimeout(r, 50));
    const second = await call("/cache/item?item=test&_=bust");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(await second.json()).toEqual(firstBody);

    expect(await (await call("/cache/item?item=test", { method: "DELETE" })).json()).toEqual({ purged: true });
    expect((await call("/cache/item?item=test")).headers.get("x-cache")).toBe("MISS");
  });
});

describe("Rate Limiting", () => {
  it("allows 5 demo requests per 10 seconds, then returns 429", async () => {
    const ip = "203.0.113.7";
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await call("/ratelimit/hit", { method: "POST" }, ip)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });

  it("limits writes across the API to 30 per minute per IP", async () => {
    const ip = "203.0.113.8";
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await call("/kv/limit-test", { method: "DELETE" }, ip)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    // Reads are never limited.
    expect((await call("/health", {}, ip)).status).toBe(200);
  });
});
