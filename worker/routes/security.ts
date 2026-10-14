import { Hono } from "hono";
import { verifyTurnstile, TOKEN_HEADER } from "../turnstile";

const security = new Hono<{ Bindings: Env }>();

// The site key is public: the browser needs it to render the widget.
// Locally it's Cloudflare's always-pass test key (set in .dev.vars).
security.get("/turnstile", (c) => c.json({ siteKey: c.env.TURNSTILE_SITEKEY }));

// Demo: verify a token and show what siteverify says about it.
security.post("/turnstile/verify", async (c) => {
  const result = await verifyTurnstile(c.env, c.req.header(TOKEN_HEADER), c.req.header("cf-connecting-ip"), "demo");
  return c.json(result, result.ok ? 200 : 403);
});

export default security;
