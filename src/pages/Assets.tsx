import { useState } from "react";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import config from "../../wrangler.jsonc?raw";

export function Assets() {
  const [probe, setProbe] = useState<unknown>(null);

  const runProbe = async () => {
    const paths = ["/favicon.svg", "/this/route/does/not/exist", "/api/health", "/api/nope"];
    const results = await Promise.all(paths.map(async (p) => {
      const res = await fetch(p);
      return { path: p, status: res.status, contentType: res.headers.get("content-type"), servedBy: p.startsWith("/api") ? "Worker" : "Static Assets" };
    }));
    setProbe(results);
  };

  return (
    <FeaturePage
      title="Static Assets"
      tagline="Host a front end on the same Worker as its API. This page is served this way."
      docs="https://developers.cloudflare.com/workers/static-assets/"
      whatItIs={<p>
        <code>npm run build</code> puts the React app in <code>dist/client</code>, and
        <code> wrangler deploy</code> uploads it next to the Worker. Requests for files are served from
        Cloudflare's edge cache and <strong>don't count as Worker invocations</strong>. Unknown paths
        fall back to <code>index.html</code> (<code>not_found_handling: "single-page-application"</code>),
        and <code>run_worker_first: ["/api/*"]</code> sends API calls to the Worker instead.
        This is Cloudflare's recommended replacement for Pages for new projects.
      </p>}
      whenToUse={[
        "SPAs (React, Vue, Svelte) with an API in one deploy",
        "Full-stack frameworks (Astro, Remix, Next via OpenNext)",
        "Plain static sites. Asset requests are free and unlimited.",
      ]}
    >
      <Demo title="Who serves what?">
        <p>This fetches four paths. Static files and unknown pages come from the assets layer (unknown pages get <code>index.html</code> with status 200). <code>/api/*</code> always reaches the Worker.</p>
        <button onClick={runProbe}>Probe routes</button>
        {probe != null && <JsonView value={probe} />}
      </Demo>
      <Demo title="The config that makes it work">
        <pre className="code" tabIndex={0}>{config}</pre>
      </Demo>
    </FeaturePage>
  );
}
