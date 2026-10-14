import { vi } from "vitest";

// Never call Cloudflare's real siteverify API from tests. Stub it, and let
// special tokens simulate each failure the Worker must handle.
const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) return realFetch(input, init);

  const token = (init?.body as FormData).get("response");
  const real = { metadata: {} }; // looks like a real (non-test-key) result
  const outcomes: Record<string, object> = {
    "fail-token": { success: false, "error-codes": ["invalid-input-response"] },
    "wrong-action": { success: true, action: "something-else", hostname: "cf-feature-lab.damian-miskey.workers.dev", ...real },
    "wrong-host": { success: true, action: "add-note", hostname: "evil.example", ...real },
    "real-add-note": { success: true, action: "add-note", hostname: "cf-feature-lab.damian-miskey.workers.dev", ...real },
  };
  // Anything else behaves like Cloudflare's always-pass test key.
  const body = outcomes[String(token)] ?? { success: true, hostname: "example.com", metadata: { result_with_testing_key: true } };
  return Response.json(body);
});
