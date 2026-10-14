import type { MiddlewareHandler } from "hono";

// Turnstile: Cloudflare's CAPTCHA replacement. The browser widget produces a
// token; the server must confirm it with the siteverify API before trusting
// the request. A token without a server-side check protects nothing.
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TOKEN_HEADER = "cf-turnstile-response";

export type TurnstileOutcome = {
  success: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

export async function verifyTurnstile(env: Env, token: string | undefined, ip: string | undefined, expectedAction: string) {
  // Tokens are short-lived, single-use and at most 2048 characters.
  if (!token || token.length > 2048) return { ok: false as const, reason: "missing-or-invalid-token" };

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  let outcome: TurnstileOutcome;
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    outcome = await res.json();
  } catch {
    return { ok: false as const, reason: "siteverify-unreachable" };
  }
  if (!outcome.success) return { ok: false as const, reason: (outcome["error-codes"] ?? []).join(",") || "failed", outcome };

  // Cloudflare's public test keys return a fixed hostname and no action, so
  // only enforce these checks for real widgets.
  if (!outcome.metadata?.result_with_testing_key) {
    // A token issued for another form (action) or another site (hostname) must not work here.
    if (outcome.action !== expectedAction) return { ok: false as const, reason: "action-mismatch", outcome };
    const allowed = env.TURNSTILE_HOSTNAMES.split(",").map((h) => h.trim());
    if (!outcome.hostname || !allowed.includes(outcome.hostname)) return { ok: false as const, reason: "hostname-mismatch", outcome };
  }
  return { ok: true as const, outcome };
}

// Route middleware: the request must carry a valid token for this action.
export const requireTurnstile = (action: string): MiddlewareHandler<{ Bindings: Env }> => async (c, next) => {
  const result = await verifyTurnstile(c.env, c.req.header(TOKEN_HEADER), c.req.header("cf-connecting-ip"), action);
  if (!result.ok) return c.json({ error: "Turnstile check failed. Complete the challenge and try again.", reason: result.reason }, 403);
  return next();
};
