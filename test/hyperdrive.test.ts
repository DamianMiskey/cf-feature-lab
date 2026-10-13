import { describe, expect, it } from "vitest";
import { call, json } from "./helpers";

// Tests never reach Neon (vitest.config.ts gives Hyperdrive a placeholder
// address), so they cover only the checks that run before a query.
describe("Hyperdrive", () => {
  it("validates new products before touching the database", async () => {
    expect((await call("/hyperdrive/products", json("POST", { name: "", price: 5 }))).status).toBe(400);
    expect((await call("/hyperdrive/products", json("POST", { name: "Thing", price: -1 }))).status).toBe(400);
  });

  it("rejects non-numeric ids", async () => {
    expect((await call("/hyperdrive/products/abc", { method: "DELETE" })).status).toBe(400);
  });
});
