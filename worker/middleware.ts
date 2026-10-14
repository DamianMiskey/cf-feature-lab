import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

type App = { Bindings: Env };

const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? "local";

// Analytics Engine: record one data point per API request. writeDataPoint()
// doesn't return a promise and adds no latency. Cloudflare batches the writes.
export const analytics: MiddlewareHandler<App> = async (c, next) => {
  const started = Date.now();
  await next();
  const group = c.req.path.split("/")[2] || "root"; // /api/<group>/...
  try {
    c.env.ANALYTICS.writeDataPoint({
      // indexes: the sampling key (max 1). Data is sampled per index value at high volume.
      indexes: [group],
      // blobs: strings you can GROUP BY or filter on.
      blobs: [group, c.req.method, c.req.path.slice(0, 100), String(c.req.raw.cf?.country ?? "XX"), String(c.req.raw.cf?.colo ?? "local")],
      // doubles: numbers you can sum, average or take quantiles of.
      doubles: [Date.now() - started, c.res.status],
    });
  } catch (e) {
    console.warn("analytics write failed", e);
  }
};

// Rate Limiting binding: every request that changes data, calls AI or uses a browser counts
// toward a per-IP budget (30 per minute, set in wrangler.jsonc).
export const limitWrites: MiddlewareHandler<App> = async (c, next) => {
  const method = c.req.method;
  const isWrite = method === "POST" || method === "PUT" || method === "DELETE";
  // Browser Rendering GETs cost browser time, so they count too (except the free status call).
  const usesBrowser = c.req.path.startsWith("/api/browser/") && c.req.path !== "/api/browser/status";
  // The rate-limit demo uses its own limiter.
  if ((!isWrite && !usesBrowser) || c.req.path.startsWith("/api/ratelimit")) return next();

  const { success } = await c.env.WRITE_LIMITER.limit({ key: clientIp(c.req.raw) });
  if (!success) {
    return c.json({ error: "Too many requests: the lab allows 30 writes per minute. Try again shortly." }, 429, { "retry-after": "60" });
  }
  return next();
};

export { clientIp };

// Security headers for API responses (static assets get theirs from
// public/_headers). Hono's secureHeaders sets nosniff, frame and referrer
// policies, HSTS and more. Responses are data, never pages, so the CSP blocks everything.
const apiHeaders = secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  // Same-origin only: no other site can embed the lab's API responses.
  crossOriginResourcePolicy: "same-origin",
  referrerPolicy: "strict-origin-when-cross-origin",
});

export const securityHeaders: MiddlewareHandler<App> = async (c, next) => {
  // WebSocket upgrade responses come straight from a Durable Object and
  // their headers can't be changed, so leave them alone.
  if (c.req.header("upgrade")?.toLowerCase() === "websocket") return next();
  return apiHeaders(c, next);
};

