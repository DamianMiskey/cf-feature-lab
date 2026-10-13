import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { usePoll } from "../usePoll";
import source from "../../worker/scheduled.ts?raw";

type CronRun = { id: number; cron: string; scheduled_time: string; ran_at: string; summary: Record<string, number> };

export function Cron() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [last, setLast] = useState<unknown>(null);
  const [error, setError] = useState("");
  const load = () => api<{ runs: CronRun[] }>("/cron/runs").then((r) => setRuns(r.runs)).catch((e) => setError(e.message));
  usePoll(load, 15000);

  const runNow = async () => {
    setError("");
    try { setLast(await api("/cron/run-now", { method: "POST" })); await load(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <FeaturePage
      title="Cron Triggers"
      tagline="Run Worker code on a schedule, with no server or scheduler to manage."
      docs="https://developers.cloudflare.com/workers/configuration/cron-triggers/"
      whatItIs={<p>
        Add <code>"triggers": {"{ \"crons\": [\"*/30 * * * *\"] }"}</code> to <code>wrangler.jsonc</code> and
        Cloudflare calls your Worker's <code>scheduled()</code> handler on that schedule (UTC).
        The handler gets the cron expression and scheduled time. Use <code>ctx.waitUntil()</code> to finish
        async work. This lab's job runs every 30 minutes: it prunes old demo rows and records a snapshot of
        the storage counts. The free plan allows 5 cron triggers per account.
      </p>}
      whenToUse={[
        "Cleanup, pruning and data retention jobs",
        "Periodic syncs, reports, digests and cache warming",
        "Health checks and uptime pings",
      ]}
    >
      {error && <p className="error">{error}</p>}
      <Demo title="Run it now">
        <p>
          A deployed Worker can't fire its own cron, so this calls the same function directly. To fire the
          real <code>scheduled()</code> handler during local dev, run:<br />
          <code>curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*"</code>
        </p>
        <button onClick={runNow}>Run housekeeping now</button>
        {last != null && <JsonView value={last} />}
      </Demo>
      <Demo title={`Run history (${runs.length})`}>
        <table className="table">
          <thead><tr><th>Trigger</th><th>Ran at</th><th>Notes</th><th>KV keys</th><th>R2 objects</th><th>Pruned jobs</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><code>{r.cron}</code></td>
                <td className="small">{new Date(r.ran_at).toLocaleString()}</td>
                <td>{r.summary.notes}</td><td>{r.summary.kvKeys}</td><td>{r.summary.r2Objects}</td><td>{r.summary.prunedJobs}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="muted">No runs yet. After deploying, one appears every 30 minutes.</td></tr>}
          </tbody>
        </table>
      </Demo>
      <CodePeek file="worker/scheduled.ts" source={source} />
    </FeaturePage>
  );
}
