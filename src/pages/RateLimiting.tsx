import { useState } from "react";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import source from "../../worker/routes/ratelimit.ts?raw";
import middleware from "../../worker/middleware.ts?raw";

export function RateLimiting() {
  const [results, setResults] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const hammer = async () => {
    setBusy(true);
    setResults([]);
    for (let i = 0; i < 20; i++) {
      const res = await fetch("/api/ratelimit/hit", { method: "POST" });
      setResults((r) => [...r, res.status]);
    }
    setBusy(false);
  };

  const allowed = results.filter((s) => s === 200).length;

  return (
    <FeaturePage
      title="Rate Limiting"
      tagline="Built-in request limits per key, with no database or counters to manage."
      docs="https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/"
      whatItIs={<p>
        Declare a limiter in <code>wrangler.jsonc</code> (e.g. 5 requests per 10 seconds) and call
        <code> env.LIMITER.limit({"{ key }"})</code>. The key can be anything: an IP, a user ID, an API key.
        It answers <code>{"{ success: true | false }"}</code> almost instantly, because counters live in each
        Cloudflare location. That makes the limit per location and approximate, which is right for abuse
        protection. For exact global quotas, use a Durable Object.
      </p>}
      whenToUse={[
        "Protecting login, sign-up and AI endpoints from abuse",
        "Per-user or per-API-key quotas",
        "Keeping free-tier usage of paid services in check",
      ]}
    >
      <Demo title="Hammer the endpoint">
        <p>
          Sends 20 requests in a row to an endpoint limited to <strong>5 per 10 seconds</strong> for your IP. Locally the
          limit is exact. In production the counters sync between servers in the background, so a burst usually gets a
          few extra requests through before 429s start. That's the trade-off for adding no latency.
        </p>
        <button onClick={hammer} disabled={busy}>{busy ? "Hammering…" : "Send 20 requests"}</button>
        {results.length > 0 && <>
          <div className="hits">
            {results.map((s, i) => <span key={i} className={`hit ${s === 200 ? "ok" : "blocked"}`} title={`Request ${i + 1}: ${s}`}>{s}</span>)}
          </div>
          <p className="small">{allowed} allowed · {results.length - allowed} blocked with <code>429 Too Many Requests</code>. Wait 10 seconds and try again.</p>
        </>}
      </Demo>
      <Demo title="It's protecting this whole lab">
        <p>
          A Hono middleware sends every <code>POST</code>, <code>PUT</code> and <code>DELETE</code> (all the writes and every
          AI call) through a second limiter: <strong>30 per minute per IP</strong>. Anyone who finds your deployed
          URL can't run up your KV, D1 or AI quotas.
        </p>
      </Demo>
      <CodePeek file="worker/routes/ratelimit.ts" source={source} />
      <CodePeek file="worker/middleware.ts" source={middleware} />
    </FeaturePage>
  );
}
