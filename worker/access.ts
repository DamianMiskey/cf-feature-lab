import { createRemoteJWKSet, jwtVerify } from "jose";

// Cloudflare Access sits in front of admin.djmiskey.com. After you log in,
// Access forwards each request with a signed JWT in the
// `Cf-Access-Jwt-Assertion` header. Always verify it in the Worker:
// signature (Access's public keys), issuer (your team domain) and audience
// (this application's AUD tag). Otherwise anyone who reaches the Worker
// another way, such as lab.djmiskey.com, could fake the header.
export const ACCESS_HEADER = "cf-access-jwt-assertion";

// Keep the key set per isolate. jose caches keys and refetches on rotation.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export type AccessIdentity = { email?: string; sub?: string; expiresAt?: string };

export async function verifyAccess(env: Env, token: string | undefined): Promise<AccessIdentity | null> {
  // Not configured yet, or no token: Access doesn't vouch for this request.
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, { issuer, audience: env.ACCESS_AUD });
    return {
      email: typeof payload.email === "string" ? payload.email : undefined,
      sub: payload.sub,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
    };
  } catch {
    return null;
  }
}
