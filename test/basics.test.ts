import { describe, expect, it } from "vitest";
import { call, json } from "./helpers";

describe("Workers basics", () => {
  it("answers the health check", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("returns JSON 404s for unknown API routes", async () => {
    const res = await call("/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No API route for /api/does-not-exist" });
  });

  it("reports whether the secret is set without leaking its value", async () => {
    const body = await (await call("/basics/env")).json<{ secret: Record<string, unknown> }>();
    expect(body.secret).toEqual({ name: "DEMO_SECRET", isSet: true, length: expect.any(Number) });
    expect(JSON.stringify(body)).not.toContain("local-only-secret-value");
  });

  it("reports the running version", async () => {
    expect(await (await call("/logs/version")).json()).toMatchObject({ id: expect.any(String) });
  });

  it("logs structured entries and turns thrown errors into JSON 500s", async () => {
    const ok = await call("/logs/demo", json("POST", { level: "warn", message: "careful" }));
    expect(await ok.json()).toMatchObject({ logged: "warn", entry: { event: "lab.demo", message: "careful" } });

    const failed = await call("/logs/demo", json("POST", { level: "error", message: "boom" }));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Demo error: boom" });
  });
});
