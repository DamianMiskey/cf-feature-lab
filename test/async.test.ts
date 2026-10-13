import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  env,
  getQueueResult,
  introspectWorkflowInstance,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import type { JobMessage } from "../worker/queue";
import { call, json } from "./helpers";

const job = (id: string, kind: JobMessage["kind"], input = "") =>
  env.DB.prepare("INSERT INTO jobs (id, kind) VALUES (?, ?)").bind(id, kind).run().then(() => ({ jobId: id, kind, input }));

describe("Cron Triggers", () => {
  it("runs housekeeping from the scheduled() handler", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "*/30 * * * *", scheduledTime: Date.now() }), env, ctx);
    await waitOnExecutionContext(ctx);

    const { runs } = await (await call("/cron/runs")).json<{ runs: { cron: string; summary: { notes: number } }[] }>();
    expect(runs[0]).toMatchObject({ cron: "*/30 * * * *", summary: { notes: 4 } });
  });
});

describe("Queues", () => {
  it("enqueues jobs and records them", async () => {
    const res = await call("/queues/send", json("POST", { kind: "word-count", count: 2, input: "a b c" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ enqueued: 2 });
  });

  it("consumes a batch: acks successes and records results", async () => {
    const body = await job("wc-1", "word-count", "the quick brown fox");
    const batch = createMessageBatch<JobMessage>("cf-feature-lab-jobs", [{ id: "m1", timestamp: new Date(), attempts: 1, body }]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env);

    expect(await getQueueResult(batch, ctx)).toMatchObject({ explicitAcks: ["m1"], retryMessages: [] });
    const row = await env.DB.prepare("SELECT status, result FROM jobs WHERE id = 'wc-1'").first<{ status: string; result: string }>();
    expect(row?.status).toBe("done");
    expect(JSON.parse(row!.result)).toMatchObject({ words: 4 });
  });

  it("marks dead-letter messages as dead, keeping the real attempt count", async () => {
    const body = await job("flaky-1", "flaky");
    await env.DB.prepare("UPDATE jobs SET attempts = 3 WHERE id = 'flaky-1'").run();
    const batch = createMessageBatch<JobMessage>("cf-feature-lab-dlq", [{ id: "m2", timestamp: new Date(), attempts: 1, body }]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env);

    expect(await getQueueResult(batch, ctx)).toMatchObject({ explicitAcks: ["m2"] });
    expect(await env.DB.prepare("SELECT status, attempts FROM jobs WHERE id = 'flaky-1'").first()).toEqual({ status: "dead", attempts: 3 });
  });
});

describe("Workflows", () => {
  it("runs onboarding end to end with retries and an approval event", async () => {
    const id = "onboard-test";
    await env.DB.prepare("INSERT INTO workflow_runs (id, name) VALUES (?, ?)").bind(id, "Tess").run();

    await using instance = await introspectWorkflowInstance(env.ONBOARDING, id);
    await instance.modify(async (m) => {
      // Don't call real Workers AI from tests.
      await m.mockStepResult({ name: "write welcome message" }, "Welcome, Tess!");
      await m.disableSleeps();
      await m.disableRetryDelays();
      await m.mockEvent({ type: "approval", payload: { approved: true } });
    });

    await env.ONBOARDING.create({ id, params: { name: "Tess" } });

    // The email step fails twice on purpose, then succeeds on attempt 3. The
    // runtime logs those two failures as "uncaught exception". That is expected.
    expect(await instance.waitForStepResult({ name: "send welcome email" })).toMatchObject({ attempts: 3 });
    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toMatchObject({ name: "Tess", welcome: "Welcome, Tess!", approved: true });

    const log = JSON.parse((await env.DB.prepare("SELECT log FROM workflow_runs WHERE id = ?").bind(id).first<string>("log"))!);
    expect(log.at(-1)).toMatchObject({ step: "finish", message: expect.stringContaining("Approved") });
  });
});
