import type { D1Migration } from "cloudflare:test";

// The test-only binding added in vitest.config.ts.
declare global {
  namespace Cloudflare {
    interface Env {
      // Optional so the real Env (used by app code) still type-checks.
      TEST_MIGRATIONS?: D1Migration[];
    }
  }
}
