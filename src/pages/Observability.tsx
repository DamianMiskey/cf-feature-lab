import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/logs.ts?raw";

export function Observability() {
  const [version, setVersion] = useState<{ id: string; tag: string | null; timestamp: string } | null>(null);
  const [message, setMessage] = useState("Hello from the Feature Lab");
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => { api<{ id: string; tag: string | null; timestamp: string }>("/logs/version").then(setVersion).catch(() => {}); }, []);

  const log = (level: "info" | "warn" | "error") => async () => {
    try {
      setResult(await api("/logs/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ level, message }) }));
    } catch (e) {
      setResult({ level, error: (e as Error).message, note: "This 500 was logged with its stack trace." });
    }
  };

  return (
    <FeaturePage
      title="Logs & Observability"
      tagline="See what your Worker is doing in production: live logs, searchable history, versions and gradual rollouts."
      docs="https://developers.cloudflare.com/workers/observability/"
      whatItIs={<p>
        With <code>"observability": {"{ \"enabled\": true }"}</code>, Cloudflare stores every request's metadata and
        <code> console.*</code> output as <strong>Workers Logs</strong>, which you can search in the dashboard. For a live
        stream, run <code>npx wrangler tail</code>. Every deploy creates a <strong>version</strong>. You can roll back to
        an earlier one, or split traffic between two versions with a gradual deployment.
      </p>}
      whenToUse={[
        "Debugging production: watch requests and errors live",
        "Structured logs you can query: log objects, not strings",
        "Safe releases: preview URLs, gradual rollouts, instant rollback",
      ]}
    >
      <Demo title="1. Write a log line, then find it">
        <p>Open a terminal and run <code>npx wrangler tail --format pretty</code>. Then click a button and watch the log appear. Afterwards, find it in <strong>Dashboard → Workers → cf-feature-lab → Observability</strong> by filtering on <code>event = "lab.demo"</code>.</p>
        <div className="form-row">
          <label className="grow">Message<input value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <button onClick={log("info")}>console.log</button>
          <button className="ghost" onClick={log("warn")}>console.warn</button>
          <button className="ghost" onClick={log("error")}>Throw an error</button>
        </div>
        {result != null && <JsonView value={result} />}
      </Demo>

      <Demo title="2. Which version answered?">
        <p>The <code>version_metadata</code> binding tells the Worker its own version, which helps when two versions serve traffic during a rollout.</p>
        {version && <JsonView value={version} />}
      </Demo>

      <Demo title="3. Releasing safely: commands to try">
        <pre className="code">{`# Every deploy is a new version
npx wrangler deployments list
npx wrangler versions list

# Upload a version WITHOUT sending traffic to it (you get a preview URL)
npx wrangler versions upload

# Gradual rollout: 90% old version, 10% new version
npx wrangler versions deploy <old-id>@90% <new-id>@10%

# Something wrong? Instantly go back
npx wrangler rollback

# Live logs, filtered
npx wrangler tail --status error
npx wrangler tail --search "lab.demo"`}</pre>
      </Demo>

      <Demo title="4. Testing: the other half of observability">
        <p>
          <code>npm test</code> runs 81 integration tests <em>inside workerd</em> (the real Workers runtime) with
          <code> @cloudflare/vitest-plugin</code>. They cover KV, D1, R2, Durable Objects (including WebSockets and alarms),
          Queues, Cron, Workflows (with mocked steps and events), caching and rate limits. Each test file gets isolated
          storage, and nothing touches your real account.
        </p>
      </Demo>

      <CodePeek file="worker/routes/logs.ts" source={source} />
    </FeaturePage>
  );
}
