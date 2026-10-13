import { Hono } from "hono";
import { clientIp } from "../middleware";

const ratelimit = new Hono<{ Bindings: Env }>();

// limit() returns { success } instantly. Counters live in the Cloudflare
// location that served the request, so the limit is per location and
// approximate, which is fine for abuse protection but not for billing.
ratelimit.post("/hit", async (c) => {
  const key = `demo:${clientIp(c.req.raw)}`;
  const { success } = await c.env.DEMO_LIMITER.limit({ key });
  if (!success) return c.json({ allowed: false, error: "Rate limited: 5 requests per 10 seconds" }, 429);
  return c.json({ allowed: true });
});

export default ratelimit;
