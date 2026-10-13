import { Hono } from "hono";

const workflows = new Hono<{ Bindings: Env }>();

type Run = { id: string; name: string; current_step: string; log: string; created_at: string };

// Start a new instance. create() returns immediately. The workflow runs in the background.
workflows.post("/", async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  const id = `onboard-${crypto.randomUUID().slice(0, 8)}`;
  const cleanName = (name?.trim() || "Ada").slice(0, 40);
  // Insert the tracking row first so the workflow's first log line has somewhere to go.
  await c.env.DB.prepare("INSERT INTO workflow_runs (id, name) VALUES (?, ?)").bind(id, cleanName).run();
  await c.env.ONBOARDING.create({ id, params: { name: cleanName } });
  return c.json({ id }, 201);
});

// List recent runs. The step log comes from D1, the live status from the Workflows API.
workflows.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM workflow_runs ORDER BY created_at DESC LIMIT 5").all<Run>();
  const runs = await Promise.all(results.map(async (r) => {
    let status: unknown;
    try {
      // Pick the documented fields. Local dev adds extra debugging keys.
      const { status: state, error, output } = await (await c.env.ONBOARDING.get(r.id)).status();
      status = { status: state, error, output };
    } catch (e) {
      status = { status: "unknown", error: { message: (e as Error).message } };
    }
    return { ...r, log: JSON.parse(r.log), instance: status };
  }));
  return c.json({ runs });
});

// Send an event to a waiting instance. That resumes step.waitForEvent("…", { type: "approval" }).
workflows.post("/:id/approval", async (c) => {
  const { approved } = await c.req.json<{ approved: boolean }>();
  const instance = await c.env.ONBOARDING.get(c.req.param("id"));
  await instance.sendEvent({ type: "approval", payload: { approved: Boolean(approved) } });
  return c.json({ ok: true });
});

workflows.post("/:id/terminate", async (c) => {
  const instance = await c.env.ONBOARDING.get(c.req.param("id"));
  await instance.terminate();
  return c.json({ ok: true });
});

export default workflows;
