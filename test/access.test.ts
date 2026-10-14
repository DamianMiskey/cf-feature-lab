import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { call } from "./helpers";
import { stubOutbound } from "./outbound-stub";

const ISSUER = "https://lab-test.cloudflareaccess.com";
const AUD = "test-aud-tag";
let accessKey: CryptoKey;
let otherKey: CryptoKey;

// Play the part of Cloudflare Access: make a signing key and publish its
// public half where the Worker looks for it (/cdn-cgi/access/certs).
beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  accessKey = pair.privateKey as CryptoKey;
  otherKey = (await generateKeyPair("RS256")).privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  stubOutbound(`${ISSUER}/cdn-cgi/access/certs`, () => Response.json({ keys: [jwk] }));
});

const token = (opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}) =>
  new SignJWT({ email: "damian.miskey@yahoo.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? AUD)
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? accessKey);

const viaAccess = async (jwt: string) => call("/security/admin", { headers: { "cf-access-jwt-assertion": jwt } });

describe("Cloudflare Access", () => {
  it("lets a valid Access login in, and reports who it is", async () => {
    const res = await viaAccess(await token());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ admin: true, via: "Cloudflare Access login", identity: { email: "damian.miskey@yahoo.com" } });
  });

  it("rejects a token for another Access application (wrong audience)", async () => {
    expect((await viaAccess(await token({ aud: "someone-elses-app" }))).status).toBe(401);
  });

  it("rejects a token from another team (wrong issuer)", async () => {
    expect((await viaAccess(await token({ iss: "https://evil.cloudflareaccess.com" }))).status).toBe(401);
  });

  it("rejects a forged token (signed with the wrong key)", async () => {
    expect((await viaAccess(await token({ key: otherKey }))).status).toBe(401);
  });

  it("rejects an expired token", async () => {
    expect((await viaAccess(await token({ exp: "-1m" }))).status).toBe(401);
  });

  it("rejects garbage in the header", async () => {
    expect((await viaAccess("not-a-jwt")).status).toBe(401);
  });

  it("whoami shows the Access identity when present", async () => {
    const res = await call("/security/whoami", { headers: { "cf-access-jwt-assertion": await token() } });
    expect(await res.json()).toMatchObject({ accessConfigured: true, access: { email: "damian.miskey@yahoo.com" } });
    expect(await (await call("/security/whoami")).json()).toMatchObject({ access: null });
  });
});
