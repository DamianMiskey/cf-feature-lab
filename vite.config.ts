import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs the Worker inside workerd (the real Workers runtime)
// during `vite dev`, and builds both the Worker and the static assets for deploy.
export default defineConfig(({ mode }) => {
  // Local Hyperdrive has no Cloudflare pool, so it connects straight to the
  // database. Take the URL from .env.local (written by `neon env pull`)
  // instead of committing it to wrangler.jsonc.
  const env = loadEnv(mode, process.cwd(), "");
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??= env.DATABASE_URL_UNPOOLED;

  return { plugins: [react(), cloudflare()] };
});
