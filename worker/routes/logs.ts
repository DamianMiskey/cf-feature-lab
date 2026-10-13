import { Hono } from "hono";

const logs = new Hono<{ Bindings: Env }>();

// Workers Logs indexes console output. Log *objects* rather than strings and
// every field becomes searchable in the dashboard's Query Builder,
// e.g. `level = "warn" AND event = "lab.demo"`.
logs.post("/demo", async (c) => {
  const { level = "info", message = "Hello from the Feature Lab" } = await c.req.json<{ level?: string; message?: string }>();
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  const entry = {
    event: "lab.demo",
    message: message.slice(0, 200),
    requestId,
    colo: c.req.raw.cf?.colo ?? "local",
    version: c.env.CF_VERSION_METADATA.id,
  };

  if (level === "error") {
    // Uncaught exceptions are logged too, with a stack trace, and the request is marked as failed.
    throw new Error(`Demo error: ${entry.message}`);
  }
  if (level === "warn") console.warn(entry);
  else console.log(entry);

  return c.json({ logged: level, entry });
});

// Which version of the Worker answered? Useful with gradual deployments, when
// two versions serve traffic at the same time.
logs.get("/version", (c) => {
  const { id, tag, timestamp } = c.env.CF_VERSION_METADATA;
  return c.json({ id, tag: tag || null, timestamp });
});

export default logs;
