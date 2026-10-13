import { Hono } from "hono";

const basics = new Hono<{ Bindings: Env }>();

// Request inspector: everything a Worker knows about the incoming request.
basics.get("/inspect", (c) => {
  const req = c.req.raw;
  // `request.cf` is added by Cloudflare's edge: where the visitor is, which
  // data center (colo) handled the request, TLS/HTTP details, and more.
  const cf = req.cf ?? {};

  return c.json({
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers),
    cf: {
      colo: cf.colo,
      country: cf.country,
      city: cf.city,
      region: cf.region,
      continent: cf.continent,
      timezone: cf.timezone,
      latitude: cf.latitude,
      longitude: cf.longitude,
      asn: cf.asn,
      asOrganization: cf.asOrganization,
      httpProtocol: cf.httpProtocol,
      tlsVersion: cf.tlsVersion,
    },
    // Local dev (Miniflare) fetches a real `cf` object for your connection,
    // so the values look the same. ENVIRONMENT tells the two apart.
    environment: c.env.ENVIRONMENT,
  });
});

// Vars vs secrets: both arrive on `env`, but only vars are visible in config.
basics.get("/env", (c) => {
  const secret = c.env.DEMO_SECRET;
  return c.json({
    vars: { APP_NAME: c.env.APP_NAME, ENVIRONMENT: c.env.ENVIRONMENT },
    secret: {
      name: "DEMO_SECRET",
      isSet: Boolean(secret),
      // Never echo a secret back. Show only its length to prove it exists.
      length: secret?.length ?? 0,
    },
  });
});

// Workers run on V8 isolates: no cold-start container, millisecond start-up.
// This endpoint times some CPU work so you can see Worker execution speed.
basics.get("/timing", async (c) => {
  const start = performance.now();
  const data = new TextEncoder().encode("cloudflare".repeat(10_000));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Note: inside Workers, timers only advance after I/O (Spectre mitigation),
  // so pure-CPU timings often read as 0ms. That's expected.
  return c.json({ sha256: hash, elapsedMs: performance.now() - start });
});

export default basics;
