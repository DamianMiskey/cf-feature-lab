import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/basics.ts?raw";

export function Basics() {
  const [inspect, setInspect] = useState<unknown>(null);
  const [env, setEnv] = useState<unknown>(null);
  const [timing, setTiming] = useState<unknown>(null);
  const [error, setError] = useState("");

  const run = (path: string, set: (v: unknown) => void) => async () => {
    setError("");
    try { set(await api(path)); } catch (e) { setError((e as Error).message); }
  };

  return (
    <FeaturePage
      title="Workers basics"
      tagline="Serverless JavaScript/TypeScript that runs in 300+ cities, starting in milliseconds."
      docs="https://developers.cloudflare.com/workers/"
      whatItIs={<p>
        A Worker is a function that receives a <code>Request</code> and returns a <code>Response</code>,
        built on standard Web APIs (fetch, crypto, streams). It runs in V8 <em>isolates</em> rather
        than containers, so there are no cold starts. Configuration lives in <code>wrangler.jsonc</code>.
        Values reach your code through <code>env</code>: plain <strong>vars</strong>,
        encrypted <strong>secrets</strong>, and <strong>bindings</strong> to other Cloudflare services.
      </p>}
      whenToUse={[
        "APIs and backends-for-frontends",
        "Request rewriting, auth, A/B tests in front of an origin",
        "Glue code between Cloudflare storage, AI and queues",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="1. Request inspector">
        <p>Cloudflare adds a <code>request.cf</code> object to every request, with the visitor's location and the data center ("colo") that handled it. Local dev fetches a real <code>cf</code> object for your connection, so deploy and compare which colo answers you.</p>
        <button onClick={run("/basics/inspect", setInspect)}>Inspect my request</button>
        {inspect != null && <JsonView value={inspect} />}
      </Demo>

      <Demo title="2. Vars vs secrets">
        <p><code>vars</code> are set in <code>wrangler.jsonc</code> and anyone with the repo can read them. Secrets are encrypted: set them with <code>npx wrangler secret put DEMO_SECRET</code>, or put them in <code>.dev.vars</code> locally. Both arrive on <code>env</code>.</p>
        <button onClick={run("/basics/env", setEnv)}>Read env</button>
        {env != null && <JsonView value={env} />}
      </Demo>

      <Demo title="3. Web Crypto at the edge">
        <p>This hashes 100 KB with <code>crypto.subtle</code>. Timers inside a Worker only advance after I/O (a Spectre mitigation), so pure CPU work often shows 0 ms.</p>
        <button onClick={run("/basics/timing", setTiming)}>Run</button>
        {timing != null && <JsonView value={timing} />}
      </Demo>

      <CodePeek file="worker/routes/basics.ts" source={source} />
    </FeaturePage>
  );
}
