import { Hono } from "hono";
import { requireAdmin } from "../admin";
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

// Admin-only: a summary that visitors shouldn't see.
security.get("/admin", requireAdmin, async (c) => {
  const [notes, jobs, runs] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notes"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM jobs"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM workflow_runs"),
  ]);
  const n = (r: D1Result) => (r.results[0] as { n: number }).n;
  return c.json({ admin: true, tokenSource: "Secrets Store (ADMIN_TOKEN)", counts: { notes: n(notes), jobs: n(jobs), workflowRuns: n(runs) } });
});

export default security;
