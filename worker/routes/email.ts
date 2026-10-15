import { Hono } from "hono";
import { requireAdmin, type AdminVars } from "../admin";

const email = new Hono<{ Bindings: Env; Variables: AdminVars }>();

// Public: just the address and how many messages arrived. No contents.
email.get("/stats", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS total, MAX(received_at) AS last FROM emails").first<{ total: number; last: string | null }>();
  return c.json({ address: c.env.EMAIL_ADDRESS, total: row?.total ?? 0, lastReceived: row?.last ?? null });
});

// Private: the inbox itself. Admin only (Access login or bearer token).
email.get("/messages", requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM emails ORDER BY id DESC LIMIT 50").all();
  return c.json({ messages: results });
});

email.delete("/messages/:id", requireAdmin, async (c) => {
  await c.env.DB.prepare("DELETE FROM emails WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

export default email;
