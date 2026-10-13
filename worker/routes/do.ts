import { Hono } from "hono";

const durable = new Hono<{ Bindings: Env }>();

// Instance names come from the URL. Restrict them so nobody can spawn unlimited objects with junk names.
const safeName = (name: string) => /^[\w-]{1,32}$/.test(name) ? name : "global";

// ── Counter ──────────────────────────────────────────────────────────────
// getByName() returns a *stub*: a handle to the one instance with that name.
// Calling a method on the stub is an RPC to wherever that object lives.
durable.get("/counter/:name", async (c) => {
  const stub = c.env.COUNTER.getByName(safeName(c.req.param("name")));
  return c.json(await stub.get());
});

durable.post("/counter/:name/increment", async (c) => {
  const stub = c.env.COUNTER.getByName(safeName(c.req.param("name")));
  return c.json({ count: await stub.increment() });
});

durable.post("/counter/:name/reset", async (c) => {
  const stub = c.env.COUNTER.getByName(safeName(c.req.param("name")));
  return c.json({ count: await stub.reset() });
});

// ── Race test ───────────────────────────────────────────────────────────
// Fire N concurrent increments at KV (read, add one, write) and at a Durable
// Object. KV loses updates because reads and writes from different requests
// interleave. The DO processes increments one at a time, so it always ends at N.
durable.post("/race", async (c) => {
  const n = Math.min(Number(c.req.query("n") ?? 20), 25);
  const key = "lab:race-counter";

  await c.env.KV.put(key, "0");
  const counter = c.env.COUNTER.getByName("race-test");
  await counter.reset();

  const kvIncrement = async () => {
    const current = Number(await c.env.KV.get(key)) || 0;
    await c.env.KV.put(key, String(current + 1));
  };

  await Promise.all([
    ...Array.from({ length: n }, kvIncrement),
    ...Array.from({ length: n }, () => counter.increment()),
  ]);

  return c.json({
    attempted: n,
    kv: Number(await c.env.KV.get(key)),
    durableObject: (await counter.get()).count,
  });
});

// ── Chat (WebSockets) ───────────────────────────────────────────────────
// The Worker forwards the WebSocket upgrade request to the room's object,
// which accepts the socket and keeps it.
durable.get("/chat/:room/ws", async (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.json({ error: "Connect with a WebSocket" }, 426);
  }
  const stub = c.env.CHAT_ROOM.getByName(safeName(c.req.param("room")));
  return stub.fetch(c.req.raw);
});

// ── Alarms ──────────────────────────────────────────────────────────────
const alarmClock = (env: Env) => env.ALARM_CLOCK.getByName("demo");

durable.get("/alarm", async (c) => c.json(await alarmClock(c.env).status()));

durable.post("/alarm", async (c) => {
  const { seconds, label } = await c.req.json<{ seconds: number; label?: string }>();
  const s = Math.min(Math.max(Number(seconds) || 5, 1), 3600);
  return c.json(await alarmClock(c.env).schedule(s, (label || "Ding!").slice(0, 40)));
});

durable.delete("/alarm", async (c) => c.json(await alarmClock(c.env).cancel()));

export default durable;
