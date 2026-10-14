import type { MiddlewareHandler } from "hono";
import { ACCESS_HEADER, verifyAccess, type AccessIdentity } from "./access";

export type AdminVars = { adminVia: "access" | "token"; accessIdentity?: AccessIdentity };

// Compare secrets in constant time. Hashing both first makes the inputs the
// same length, and timingSafeEqual takes the same time whether the first byte
// or the last one differs, so response timing can't leak the token bit by bit.
async function sameSecret(given: string, expected: string) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Admin-only routes need `Authorization: Bearer <token>`. The expected token
// lives in the account-level Secrets Store, not in this Worker's own secrets,
// so other Workers can share it and it can be rotated in one place.
//
// Two ways in: a request that came through Cloudflare Access (admin.djmiskey.com)
// with a valid signed login, or a bearer token for scripts and the other hostnames.
export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: AdminVars }> = async (c, next) => {
  const identity = await verifyAccess(c.env, c.req.header(ACCESS_HEADER));
  if (identity) {
    c.set("adminVia", "access");
    c.set("accessIdentity", identity);
    return next();
  }

  const header = c.req.header("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const unauthorized = () => c.json({ error: "Admin token required" }, 401, { "www-authenticate": 'Bearer realm="cf-feature-lab"' });
  // No credentials at all: refuse without touching the secret.
  if (!given) return unauthorized();

  let expected: string;
  try {
    expected = await c.env.ADMIN_TOKEN.get();
  } catch {
    // Fail closed: if the secret is missing, nobody gets in.
    return c.json({ error: "Admin access isn't configured" }, 503);
  }
  if (!(await sameSecret(given, expected))) return unauthorized();
  c.set("adminVia", "token");
  return next();
};
