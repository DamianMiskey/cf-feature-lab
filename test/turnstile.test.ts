import { describe, expect, it } from "vitest";
import { call, json } from "./helpers";

const note = (token: string | null) => {
  const init = json("POST", { author: "Bot?", body: "hello", tag: "turnstile" });
  const headers = new Headers(init.headers);
  if (token === null) headers.set("cf-turnstile-response", "");
  else headers.set("cf-turnstile-response", token);
  return call("/d1/notes", { ...init, headers });
};

describe("Turnstile", () => {
  it("exposes the public site key", async () => {
    expect(await (await call("/security/turnstile")).json()).toEqual({ siteKey: "1x00000000000000000000AA" });
  });

  it("rejects writes with no token", async () => {
    const res = await note(null);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: "missing-or-invalid-token" });
  });

  it("rejects absurdly long tokens without calling siteverify", async () => {
    expect((await note("x".repeat(2049))).status).toBe(403);
  });

  it("rejects tokens siteverify says are invalid", async () => {
    expect(await (await note("fail-token")).json()).toMatchObject({ reason: "invalid-input-response" });
  });

  it("rejects a token issued for a different action", async () => {
    expect(await (await note("wrong-action")).json()).toMatchObject({ reason: "action-mismatch" });
  });

  it("rejects a token issued on another hostname", async () => {
    expect(await (await note("wrong-host")).json()).toMatchObject({ reason: "hostname-mismatch" });
  });

  it("accepts a real token with the right action and hostname", async () => {
    expect((await note("real-add-note")).status).toBe(201);
  });

  it("protects R2 uploads too", async () => {
    const res = await call("/r2/a.txt", { method: "PUT", body: "hi", headers: { "content-type": "text/plain", "cf-turnstile-response": "fail-token" } });
    expect(res.status).toBe(403);
  });
});
