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
