import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import { usePoll } from "../usePoll";
import producerSource from "../../worker/routes/queues.ts?raw";
import consumerSource from "../../worker/queue.ts?raw";

type Job = { id: string; kind: string; status: string; attempts: number; result: Record<string, unknown> | null; created_at: string; updated_at: string };

const KINDS = [
  { kind: "word-count", label: "Word count ×3", count: 3, help: "Instant jobs: see how they're delivered as a batch" },
  { kind: "slow", label: "Slow job ×2", count: 2, help: "3 seconds of work each; your request returns immediately" },
  { kind: "flaky", label: "Flaky job ×6", count: 6, help: "Fail 60% of the time: watch retries and the dead-letter queue" },
] as const;

export function Queues() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastSend, setLastSend] = useState("");
  const [error, setError] = useState("");
  const load = () => api<{ jobs: Job[] }>("/queues/jobs").then((r) => setJobs(r.jobs)).catch((e) => setError(e.message));
  usePoll(load, 1500);

  const send = async (kind: string, count: number) => {
    setError("");
    try {
      const r = await api<{ enqueued: number; sendMs: number }>("/queues/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, count, input: "The quick brown fox jumps over the lazy dog" }),
      });
      setLastSend(`Enqueued ${r.enqueued} × ${kind} in ${r.sendMs} ms. The response came back before any of the work ran.`);
      load();
    } catch (e) { setError((e as Error).message); }
  };

  const clear = async () => { await api("/queues/jobs", { method: "DELETE" }); load(); };

  return (
    <FeaturePage
      title="Queues"
      tagline="Send work to the background and process it reliably with batching, retries and dead-letter queues."
      docs="https://developers.cloudflare.com/queues/"
      whatItIs={<p>
        A <strong>producer</strong> (any Worker with a queue binding) calls <code>env.JOBS.send()</code> and moves on.
        Cloudflare stores the message and delivers it to a <strong>consumer</strong> Worker's <code>queue()</code>
        handler in batches. If processing fails, the message is retried. After <code>max_retries</code> it moves to a
        <strong> dead-letter queue</strong> (DLQ) so it isn't lost. Delivery is at-least-once, so make jobs safe to run twice.
      </p>}
      whenToUse={[
        "Slow work that shouldn't block a response: emails, image processing, webhooks",
        "Smoothing traffic spikes, since the consumer works at its own pace",
        "Talking to unreliable APIs, with retries built in",
      ]}
    >
      {error && <p className="error">{error}</p>}
      <Demo title="Produce some jobs">
        <div className="form-row">
          {KINDS.map((k) => (
            <button key={k.kind} className={k.kind === "flaky" ? "" : "ghost"} title={k.help} onClick={() => send(k.kind, k.count)}>{k.label}</button>
          ))}
          <button className="ghost" onClick={clear}>Clear list</button>
        </div>
        <ul className="small muted">{KINDS.map((k) => <li key={k.kind}><strong>{k.kind}</strong>: {k.help}</li>)}</ul>
        {lastSend && <p className="small">{lastSend}</p>}
      </Demo>
      <Demo title={`Jobs (live · ${jobs.length})`}>
        <p className="small muted">Each job's status is written to D1 by the consumer. Delivery locally is near-instant. Deployed, expect a second or two.</p>
        <table className="table">
          <thead><tr><th>Job</th><th>Kind</th><th>Status</th><th>Attempts</th><th>Result</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td><code>{j.id}</code></td>
                <td>{j.kind}</td>
                <td><span className={`status status-${j.status}`}>{j.status}</span></td>
                <td>{j.attempts}</td>
                <td className="small muted">{j.result ? JSON.stringify(j.result) : "…"}</td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={5} className="muted">No jobs yet. Produce some above.</td></tr>}
          </tbody>
        </table>
      </Demo>
      <CodePeek file="worker/routes/queues.ts (producer)" source={producerSource} />
      <CodePeek file="worker/queue.ts (consumer)" source={consumerSource} />
    </FeaturePage>
  );
}
