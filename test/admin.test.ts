import { adminSecretsStore, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call } from "./helpers";

const TOKEN = "test-admin-token-1234567890";
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

describe("Admin auth (token in Secrets Store)", () => {
  // The local Secrets Store simulator logs "Secret not found" and a cancelled
  // request for this test. Our code catches the error and answers 503, which is expected.
  it("fails closed when the secret isn't configured", async () => {
    expect((await call("/security/admin", bearer(TOKEN))).status).toBe(503);
  });

  it("requires the right bearer token", async () => {
    await adminSecretsStore(env.ADMIN_TOKEN).create(TOKEN);

    const none = await call("/security/admin");
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain("Bearer");

    expect((await call("/security/admin", bearer("wrong"))).status).toBe(401);
    // Same length, last character different: still rejected.
    expect((await call("/security/admin", bearer(TOKEN.slice(0, -1) + "X"))).status).toBe(401);
    expect((await call("/security/admin", { headers: { authorization: TOKEN } })).status).toBe(401);

    const ok = await call("/security/admin", bearer(TOKEN));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ admin: true, counts: { notes: 4 } });
  });

  it("protects clearing all queue jobs", async () => {
    await adminSecretsStore(env.ADMIN_TOKEN).create(TOKEN);
    expect((await call("/queues/jobs", { method: "DELETE" })).status).toBe(401);
    expect((await call("/queues/jobs", { method: "DELETE", ...bearer(TOKEN) })).status).toBe(200);
  });
});
