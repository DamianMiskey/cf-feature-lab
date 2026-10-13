import { Hono } from "hono";

const cache = new Hono<{ Bindings: Env }>();

// The Cache API stores Response objects in the cache of the Cloudflare
// location serving the request. It isn't replicated globally: each location
// has its own copy.

// A "slow origin": pretends to call a backend that takes 1.2 seconds.
async function slowOrigin(item: string) {
  await new Promise((r) => setTimeout(r, 1200));
  return { item, price: Math.round(Math.random() * 10000) / 100, generatedAt: new Date().toISOString() };
}

const cacheKey = (url: string) => {
  // Build the key from only the parts that matter, so ?_=random cache-busters don't create new entries.
  const u = new URL(url);
  return new Request(`${u.origin}/api/cache/item?item=${encodeURIComponent(u.searchParams.get("item") ?? "default")}`);
};

cache.get("/item", async (c) => {
  const started = Date.now();
  const key = cacheKey(c.req.url);
  const store = caches.default;

  const hit = await store.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("x-cache", "HIT");
    res.headers.set("x-worker-ms", String(Date.now() - started));
    return res;
  }

  const data = await slowOrigin(new URL(key.url).searchParams.get("item")!);
  const res = new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      // The Cache API uses this to decide how long to keep the response.
      "cache-control": "public, max-age=30",
      "x-cached-at": new Date().toISOString(),
    },
  });
  // Store a copy without making the user wait for the write.
  c.executionCtx.waitUntil(store.put(key, res.clone()));
  res.headers.set("x-cache", "MISS");
  res.headers.set("x-worker-ms", String(Date.now() - started));
  return res;
});

// Purge: remove one entry from this location's cache.
cache.delete("/item", async (c) => {
  const purged = await caches.default.delete(cacheKey(c.req.url));
  return c.json({ purged });
});

export default cache;
