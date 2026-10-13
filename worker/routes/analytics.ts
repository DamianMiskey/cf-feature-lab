import { Hono } from "hono";

const analytics = new Hono<{ Bindings: Env }>();

const DATASET = "cf_feature_lab_requests";

// Analytics Engine data is read with SQL over Cloudflare's HTTP API, which
// needs an API token with "Account Analytics: Read". It's not a binding.
async function sql<T>(env: Env, query: string): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
    body: query,
  });
  if (!res.ok) throw new Error(`SQL API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { data: T[] }).data;
}

// blob1 = route group, blob2 = method, blob4 = country, double1 = ms, double2 = status.
// Rows can be sampled at high volume, so counts use SUM(_sample_interval), not COUNT().
const QUERIES = {
  byRoute: `
    SELECT blob1 AS route,
           SUM(_sample_interval) AS requests,
           SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_ms,
           SUM(IF(double2 >= 400, _sample_interval, 0)) AS errors
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '24' HOUR
    GROUP BY route ORDER BY requests DESC LIMIT 20
    FORMAT JSON`,
  byCountry: `
    SELECT blob4 AS country, SUM(_sample_interval) AS requests
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '24' HOUR
    GROUP BY country ORDER BY requests DESC LIMIT 10
    FORMAT JSON`,
  timeline: `
    SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, SUM(_sample_interval) AS requests
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '24' HOUR
    GROUP BY hour ORDER BY hour
    FORMAT JSON`,
};

analytics.get("/", async (c) => {
  if (!c.env.CF_ANALYTICS_TOKEN) {
    return c.json({ configured: false, queries: QUERIES });
  }
  const [byRoute, byCountry, timeline] = await Promise.all([
    sql(c.env, QUERIES.byRoute),
    sql(c.env, QUERIES.byCountry),
    sql(c.env, QUERIES.timeline),
  ]);
  return c.json({ configured: true, byRoute, byCountry, timeline, queries: QUERIES });
});

export default analytics;
