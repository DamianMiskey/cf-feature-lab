import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import middleware from "../../worker/middleware.ts?raw";
import source from "../../worker/routes/analytics.ts?raw";

type Row = Record<string, string | number>;
type Result = { configured: boolean; byRoute?: Row[]; byCountry?: Row[]; timeline?: Row[]; queries: Record<string, string> };

function Bars({ rows, label, value }: { rows: Row[]; label: string; value: string }) {
  const max = Math.max(...rows.map((r) => Number(r[value])), 1);
  return (
    <div>
      {rows.map((r) => (
        <div key={String(r[label])} className="bar-row">
          <span className="small">{String(r[label])}</span>
          <div className="bar"><div style={{ width: `${(Number(r[value]) / max) * 100}%` }} /></div>
          <span className="small muted">{Number(r[value]).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsEngine() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const load = () => api<Result>("/analytics").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <FeaturePage
      title="Workers Analytics Engine"
      tagline="Write custom metrics from your code with no limit on cardinality, then query them with SQL."
      docs="https://developers.cloudflare.com/analytics/analytics-engine/"
      whatItIs={<p>
        <code>env.ANALYTICS.writeDataPoint({"{ indexes, blobs, doubles }"})</code> records an event without
        awaiting it, so it adds no latency. <strong>Blobs</strong> are strings to group or filter by,
        <strong> doubles</strong> are numbers to aggregate, and the <strong>index</strong> is the sampling key. You read
        the data back with SQL through Cloudflare's API, or with Grafana. This lab records one data point for
        every <code>/api</code> request: route, method, country, colo, duration and status.
      </p>}
      whenToUse={[
        "Per-customer usage metering and billing data",
        "Product analytics and custom dashboards",
        "High-cardinality metrics (per user, per URL) that would be costly elsewhere",
      ]}
    >
      {error && <p className="error">{error}</p>}
      {data && !data.configured && (
        <Demo title="One step to see the data">
          <p>Writes are already happening for every API request. Reading them needs an API token, because queries go through Cloudflare's SQL API:</p>
          <ol className="small">
            <li>Dashboard → <strong>My Profile → API Tokens → Create Token → Custom token</strong>, with permission <strong>Account · Account Analytics · Read</strong>.</li>
            <li>Production: <code>npx wrangler secret put CF_ANALYTICS_TOKEN</code>. Local: put it in <code>.dev.vars</code> and restart <code>npm run dev</code>.</li>
            <li>Local dev doesn't send writes to Cloudflare, so <strong>deploy</strong> and click around the live site to fill the dataset.</li>
          </ol>
        </Demo>
      )}
      {data?.configured && (
        <>
          <Demo title="Requests by route (last 24 h)">
            {data.byRoute?.length ? <>
              <Bars rows={data.byRoute} label="route" value="requests" />
              <table className="table">
                <thead><tr><th>Route</th><th>Requests</th><th>Avg ms</th><th>Errors</th></tr></thead>
                <tbody>{data.byRoute.map((r) => (
                  <tr key={String(r.route)}><td><code>{r.route}</code></td><td>{r.requests}</td><td>{Number(r.avg_ms).toFixed(1)}</td><td>{r.errors}</td></tr>
                ))}</tbody>
              </table>
            </> : <p className="muted">No data yet. Writes from the deployed Worker show up within a minute.</p>}
          </Demo>
          <Demo title="Requests by country">
            {data.byCountry?.length ? <Bars rows={data.byCountry} label="country" value="requests" /> : <p className="muted">No data yet.</p>}
          </Demo>
        </>
      )}
      {data && (
        <Demo title="The SQL behind it">
          <p className="small muted">Counts use <code>SUM(_sample_interval)</code> because at high volume Analytics Engine stores a sample and records how many events each stored row represents.</p>
          <pre className="code" tabIndex={0}>{data.queries.byRoute.trim()}</pre>
          <button className="ghost" onClick={load}>Refresh</button>
        </Demo>
      )}
      <CodePeek file="worker/middleware.ts (writing)" source={middleware} />
      <CodePeek file="worker/routes/analytics.ts (querying)" source={source} />
    </FeaturePage>
  );
}
