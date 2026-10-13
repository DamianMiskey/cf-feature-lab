import { Hono } from "hono";

const kv = new Hono<{ Bindings: Env }>();

// All demo keys share a prefix so the lab never touches anything else.
const PREFIX = "lab:";

// List keys by prefix. list() returns key names plus their metadata and
// expiration, without fetching the values (that needs a get per key).
kv.get("/", async (c) => {
  const prefix = PREFIX + (c.req.query("prefix") ?? "");
  const listed = await c.env.KV.list({ prefix, limit: 50 });
  return c.json({
    keys: listed.keys.map((k) => ({ ...k, name: k.name.slice(PREFIX.length) })),
    list_complete: listed.list_complete,
    // A cursor is only returned when there are more keys to page through.
    cursor: listed.list_complete ? null : listed.cursor,
  });
});

// Read one value and its metadata in a single call.
kv.get("/:key", async (c) => {
  const started = Date.now();
  const { value, metadata } = await c.env.KV.getWithMetadata(PREFIX + c.req.param("key"), {
    type: "text",
    // cacheTtl keeps hot keys cached in this data center for faster reads (min 30s).
    cacheTtl: 30,
  });
  if (value === null) return c.json({ error: "Key not found" }, 404);
  return c.json({ key: c.req.param("key"), value, metadata, readMs: Date.now() - started });
});

// Write a value with an optional TTL and JSON metadata (max 1024 bytes).
kv.put("/:key", async (c) => {
  const { value, ttl, metadata } = await c.req.json<{ value: string; ttl?: number; metadata?: Record<string, unknown> }>();
  if (typeof value !== "string") return c.json({ error: "value must be a string" }, 400);
  if (ttl !== undefined && ttl < 60) return c.json({ error: "KV's minimum TTL is 60 seconds" }, 400);

  await c.env.KV.put(PREFIX + c.req.param("key"), value, {
    expirationTtl: ttl,
    metadata: { ...metadata, writtenAt: new Date().toISOString() },
  });
  return c.json({ ok: true });
});

kv.delete("/:key", async (c) => {
  await c.env.KV.delete(PREFIX + c.req.param("key"));
  return c.json({ ok: true });
});

export default kv;
