import { SELF } from "cloudflare:test";

// SELF is the Worker under test. SELF.fetch() goes through the real fetch
// handler, including routing and middleware.
// Each call gets a fresh fake client IP, so the 30-writes-per-minute limiter
// doesn't trip across a test file. Pass `ip` to test the limiter itself.
export const call = (path: string, init: RequestInit = {}, ip = crypto.randomUUID()) => {
  const headers = new Headers(init.headers);
  headers.set("cf-connecting-ip", ip);
  return SELF.fetch(`https://lab.test/api${path}`, { ...init, headers });
};

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Rate limiters count in fixed time windows. A burst that straddles a window
// boundary sees the count reset partway through, so "request N+1 is blocked"
// is flaky on slow machines (it failed once in Workers Builds). Robust check:
// the first `limit` requests must pass, and of `2 * limit + 1` requests at
// least one must be blocked, because one of the two windows must go over the limit.
export async function burst(limit: number, send: () => Promise<Response>) {
  const statuses: number[] = [];
  for (let i = 0; i < 2 * limit + 1; i++) statuses.push((await send()).status);
  return { firstWindow: statuses.slice(0, limit), blocked: statuses.filter((s) => s === 429).length };
}
