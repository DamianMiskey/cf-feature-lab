import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

// Tests run *inside* workerd (the real Workers runtime) with the bindings from
// wrangler.jsonc, all simulated locally. Each test file gets isolated storage.
// Tests never reach Neon: Hyperdrive gets a placeholder address, and only
// input validation is tested for it.
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= "postgresql://test:test@127.0.0.1:5432/test";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      agents(),
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // Never touch real AI / Vectorize from tests. Those routes aren't tested.
        remoteBindings: false,
        // Pass the migrations to the setup file through a test-only binding.
        // DEMO_SECRET is set here too, so tests pass on CI where .dev.vars doesn't exist.
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEMO_SECRET: "test-secret",
            // Cloudflare's public Turnstile test keys. siteverify itself is stubbed in test/turnstile-stub.ts.
            TURNSTILE_SITEKEY: "1x00000000000000000000AA",
            TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts", "./test/turnstile-stub.ts"],
    },
  };
});
