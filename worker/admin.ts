import type { MiddlewareHandler } from "hono";

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
export const requireAdmin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  let expected: string;
  try {
    expected = await c.env.ADMIN_TOKEN.get();
  } catch {
    // Fail closed: if the secret is missing, nobody gets in.
    return c.json({ error: "Admin access isn't configured" }, 503);
  }
  if (!given || !(await sameSecret(given, expected))) {
    return c.json({ error: "Admin token required" }, 401, { "www-authenticate": 'Bearer realm="cf-feature-lab"' });
  }
  return next();
};
