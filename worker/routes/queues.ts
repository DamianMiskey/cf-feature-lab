import { Hono } from "hono";
import { requireAdmin } from "../admin";
import type { JobKind, JobMessage } from "../queue";

const queues = new Hono<{ Bindings: Env }>();

const KINDS: JobKind[] = ["word-count", "slow", "flaky"];

// Producer: record each job in D1, then hand the messages to the queue.
// The request returns at once. The consumer processes the jobs later.
queues.post("/send", async (c) => {
  const { kind, count = 1, input = "" } = await c.req.json<{ kind: JobKind; count?: number; input?: string }>();
  if (!KINDS.includes(kind)) return c.json({ error: `kind must be one of ${KINDS.join(", ")}` }, 400);
  const n = Math.min(Math.max(Number(count) || 1, 1), 10);

  const messages: JobMessage[] = Array.from({ length: n }, () => ({
    jobId: crypto.randomUUID().slice(0, 8),
    kind,
    input: String(input).slice(0, 2000),
  }));

  const insert = c.env.DB.prepare("INSERT INTO jobs (id, kind) VALUES (?, ?)");
  await c.env.DB.batch(messages.map((m) => insert.bind(m.jobId, m.kind)));

  const started = Date.now();
  // sendBatch() sends up to 100 messages in one call.
  await c.env.JOBS.sendBatch(messages.map((body) => ({ body })));
  return c.json({ enqueued: n, ids: messages.map((m) => m.jobId), sendMs: Date.now() - started }, 202);
});

queues.get("/jobs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 30").all<{ result: string | null }>();
  return c.json({ jobs: results.map((j) => ({ ...j, result: j.result ? JSON.parse(j.result) : null })) });
});

// Wiping every job is admin-only.
queues.delete("/jobs", requireAdmin, async (c) => {
  await c.env.DB.prepare("DELETE FROM jobs").run();
  return c.json({ ok: true });
});

export default queues;
