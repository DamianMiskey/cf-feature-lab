// The Cron Trigger's job: housekeeping that keeps the lab tidy, plus a
// summary row so the UI can show that it ran.
export async function runHousekeeping(env: Env, cron: string, scheduledTime: number) {
  // Prune old rows so the demo tables stay small.
  const [prunedJobs, prunedRuns] = await env.DB.batch([
    env.DB.prepare("DELETE FROM jobs WHERE created_at < datetime('now', '-1 day')"),
    env.DB.prepare("DELETE FROM cron_runs WHERE id NOT IN (SELECT id FROM cron_runs ORDER BY id DESC LIMIT 100)"),
  ]);
  const notes = await env.DB.prepare("SELECT COUNT(*) AS n FROM notes").first<number>("n");
  const kvKeys = (await env.KV.list({ prefix: "lab:", limit: 1000 })).keys.length;
  const r2Objects = (await env.BUCKET.list({ prefix: "uploads/", limit: 1000 })).objects.length;

  const summary = {
    notes,
    kvKeys,
    r2Objects,
    prunedJobs: prunedJobs.meta.changes,
    prunedCronRuns: prunedRuns.meta.changes,
  };
  await env.DB
    .prepare("INSERT INTO cron_runs (cron, scheduled_time, summary) VALUES (?, ?, ?)")
    .bind(cron, new Date(scheduledTime).toISOString(), JSON.stringify(summary))
    .run();
  console.log("housekeeping", cron, summary);
  return summary;
}
