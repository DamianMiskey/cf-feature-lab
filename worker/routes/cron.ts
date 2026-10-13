import { Hono } from "hono";
import { runHousekeeping } from "../scheduled";

const cron = new Hono<{ Bindings: Env }>();

cron.get("/runs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM cron_runs ORDER BY id DESC LIMIT 20").all<{ summary: string }>();
  return c.json({ runs: results.map((r) => ({ ...r, summary: JSON.parse(r.summary) })) });
});

// A deployed Worker can't fire its own Cron Trigger, so "Run now" calls the
// same function the scheduled() handler uses. Locally you can also trigger the
// real handler with: curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*"
cron.post("/run-now", async (c) => c.json(await runHousekeeping(c.env, "manual", Date.now())));

export default cron;
