import { Hono } from "hono";
import { ACCESS_HEADER, verifyAccess } from "../access";
import { requireAdmin, type AdminVars } from "../admin";
import { verifyTurnstile, TOKEN_HEADER } from "../turnstile";

const security = new Hono<{ Bindings: Env; Variables: AdminVars }>();

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
  return c.json({
    admin: true,
    via: c.get("adminVia") === "access" ? "Cloudflare Access login" : "Bearer token from Secrets Store (ADMIN_TOKEN)",
    identity: c.get("accessIdentity") ?? null,
    counts: { notes: n(notes), jobs: n(jobs), workflowRuns: n(runs) },
  });
});

// Who does Cloudflare Access say you are? On admin.djmiskey.com this shows
// your login. On other hostnames there's no Access token, so it's null.
security.get("/whoami", async (c) => {
  const identity = await verifyAccess(c.env, c.req.header(ACCESS_HEADER));
  return c.json({ host: new URL(c.req.url).hostname, access: identity, accessConfigured: Boolean(c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD) });
});

export default security;
