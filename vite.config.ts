import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";

// The Cloudflare plugin runs the Worker inside workerd (the real Workers runtime)
// during `vite dev`, and builds both the Worker and the static assets for deploy.
export default defineConfig(({ mode }) => {
  // Local Hyperdrive has no Cloudflare pool, so it connects straight to the
  // database. Take the URL from .env.local (written by `neon env pull`)
  // instead of committing it to wrangler.jsonc.
  const env = loadEnv(mode, process.cwd(), "");

  // E2E=1 (the Playwright server): never touch the real account or Neon, and
  // keep test data in its own folder, apart from your local dev data. Workers
  // AI and Vectorize have no local simulation, so their demos fail there.
  const e2e = process.env.E2E === "1";
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= e2e
    ? "postgresql://test:test@127.0.0.1:5432/test"
    : env.DATABASE_URL_UNPOOLED;
  const worker = e2e ? cloudflare({ remoteBindings: false, persistState: { path: ".wrangler/e2e-state" } }) : cloudflare();

  // agents() compiles the @callable() decorators, which Vite's compiler (Oxc) doesn't support yet.
  return { plugins: [agents(), react(), worker] };
});
