import { vi } from "vitest";

// Tests never reach real external services. Outbound fetches to the URLs
// below are answered locally (the tests share the Worker's isolate, so this
// stub applies to Worker code too). Anything else goes through unchanged.
type Handler = (init?: RequestInit) => Response | Promise<Response>;
const handlers = new Map<string, Handler>();
export const stubOutbound = (urlPrefix: string, handler: Handler) => handlers.set(urlPrefix, handler);

const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  for (const [prefix, handler] of handlers) if (url.startsWith(prefix)) return handler(init);
  return realFetch(input, init);
});

// ── Turnstile siteverify: special tokens simulate each failure ──
stubOutbound("https://challenges.cloudflare.com/turnstile/v0/siteverify", (init) => {
  const token = (init?.body as FormData).get("response");
  const real = { metadata: {} }; // looks like a real (non-test-key) result
  const outcomes: Record<string, object> = {
    "fail-token": { success: false, "error-codes": ["invalid-input-response"] },
    "wrong-action": { success: true, action: "something-else", hostname: "cf-feature-lab.damian-miskey.workers.dev", ...real },
    "wrong-host": { success: true, action: "add-note", hostname: "evil.example", ...real },
    "real-add-note": { success: true, action: "add-note", hostname: "cf-feature-lab.damian-miskey.workers.dev", ...real },
  };
  // Anything else behaves like Cloudflare's always-pass test key.
  return Response.json(outcomes[String(token)] ?? { success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
});
