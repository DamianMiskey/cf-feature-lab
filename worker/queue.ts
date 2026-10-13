export type JobKind = "word-count" | "slow" | "flaky";
export type JobMessage = { jobId: string; kind: JobKind; input: string };

const setJob = (env: Env, id: string, status: string, attempts: number, result: unknown) =>
  env.DB
    // MAX(): the dead-letter queue counts its own deliveries from 1, so keep the highest count seen.
    .prepare("UPDATE jobs SET status = ?, attempts = MAX(attempts, ?), result = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(status, attempts, JSON.stringify(result), id)
    .run();

// The Worker's queue() handler receives batches from every queue it consumes.
// batch.queue says which one. Each message is acknowledged (ack) or sent back
// for another try (retry). Anything left unhandled is retried as part of the batch.
export async function handleQueue(batch: MessageBatch<JobMessage>, env: Env) {
  // Messages that ran out of retries land in the dead-letter queue.
  if (batch.queue === "cf-feature-lab-dlq") {
    for (const msg of batch.messages) {
      await setJob(env, msg.body.jobId, "dead", msg.attempts, { error: "Gave up after max_retries; moved to the dead-letter queue" });
      msg.ack();
    }
    return;
  }

  for (const msg of batch.messages) {
    const { jobId, kind, input } = msg.body;
    try {
      const result = await runJob(kind, input, msg.attempts);
      await setJob(env, jobId, "done", msg.attempts, { ...result, batchSize: batch.messages.length });
      msg.ack();
    } catch (err) {
      await setJob(env, jobId, "retrying", msg.attempts, { error: (err as Error).message });
      // Wait 2 seconds before redelivering this message.
      msg.retry({ delaySeconds: 2 });
    }
  }
}

async function runJob(kind: JobKind, input: string, attempt: number) {
  switch (kind) {
    case "word-count":
      return { words: input.trim().split(/\s+/).filter(Boolean).length, chars: input.length };
    case "slow":
      // Pretend to do 3 seconds of work. The user waited 0 ms for it.
      await new Promise((r) => setTimeout(r, 3000));
      return { tookMs: 3000 };
    case "flaky":
      // Fails 60% of the time: some jobs succeed after retries, others end up in the DLQ.
      if (Math.random() < 0.6) throw new Error(`Random failure on attempt ${attempt}`);
      return { succeededOnAttempt: attempt };
  }
}
