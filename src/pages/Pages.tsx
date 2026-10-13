import { useState } from "react";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";

const PAGES_URL = "https://cf-feature-lab-pages.pages.dev";

type Row = [string, string, string];
const comparison: Row[] = [
  ["Config", "wrangler.jsonc with main + assets", "wrangler.jsonc with pages_build_output_dir"],
  ["Server code", "One Worker entry (fetch, scheduled, queue…)", "File-based routes in /functions"],
  ["Routing", "Your own router (Hono here)", "Folder structure: [param], [[catchall]], _middleware"],
  ["Static files", "assets.directory, SPA fallback, _headers / _redirects", "Output folder, 404.html, _headers / _redirects"],
  ["Bindings", "All of them", "Most of them (KV, D1, R2, AI, service bindings…)"],
  ["Durable Objects / Workflows classes", "Defined here", "Can only bind to classes defined in a Worker"],
  ["Cron Triggers & queue consumers", "Yes", "No"],
  ["Preview URLs", "Per version (preview_urls)", "Per deployment and per branch alias"],
  ["Git integration", "Workers Builds", "Pages Git integration"],
  ["Cloudflare's direction", "Recommended for new projects", "Supported, but new features land in Workers first"],
];

export function Pages() {
  const [hello, setHello] = useState<unknown>(null);
  const [error, setError] = useState("");

  const call = async (path: string) => {
    setError("");
    try {
      const started = performance.now();
      const res = await fetch(`${PAGES_URL}${path}`);
      setHello({ ms: Math.round(performance.now() - started), status: res.status, body: await res.json() });
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <FeaturePage
      title="Workers vs Pages"
      tagline="Two ways to host a site on Cloudflare. This lab is a Worker; its sibling project is a classic Pages site."
      docs="https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/"
      whatItIs={<p>
        <strong>Pages</strong> started as static hosting with Git deploys, then gained <em>Pages Functions</em>: files in
        <code> /functions</code> that become routes. <strong>Workers with Static Assets</strong> (this app) now does
        everything Pages does, plus Cron, Queues, Durable Objects and more, in one project. Both run on the same
        runtime and use the same bindings. The sibling project <code>../cf-feature-lab-pages</code> shows the Pages
        way, and talks to this Worker through a <strong>service binding</strong>.
      </p>}
      whenToUse={[
        "New project → Workers + Static Assets",
        "Existing Pages site → it keeps working. Migrate when you need Worker-only features.",
        "Pages is still handy for pure static sites with Git preview deploys",
      ]}
    >
      <Demo title="Side by side">
        <table className="table">
          <thead><tr><th /><th>Workers + Static Assets (this app)</th><th>Pages (sibling project)</th></tr></thead>
          <tbody>{comparison.map(([k, w, p]) => <tr key={k}><td><strong>{k}</strong></td><td className="small">{w}</td><td className="small">{p}</td></tr>)}</tbody>
        </table>
      </Demo>

      <Demo title="The live Pages project">
        <ul>
          <li>Production: <a href={PAGES_URL} target="_blank" rel="noreferrer">{PAGES_URL.replace("https://", "")}</a> (from <code>npm run deploy</code>)</li>
          <li>Branch alias: <a href="https://preview.cf-feature-lab-pages.pages.dev" target="_blank" rel="noreferrer">preview.cf-feature-lab-pages.pages.dev</a> (from <code>npm run deploy:preview</code>)</li>
          <li>Every deployment also gets its own permanent URL, like <code>&lt;hash&gt;.cf-feature-lab-pages.pages.dev</code>.</li>
        </ul>
        <p>Call it from this page. The middleware adds a CORS header, so the browser allows the cross-origin request:</p>
        <div className="form-row">
          <button onClick={() => call("/api/hello")}>GET /api/hello</button>
          <button className="ghost" onClick={() => call("/api/greet/visitor")}>GET /api/greet/visitor</button>
          <button className="ghost" onClick={() => call("/api/lab/do/counter/global")}>Pages → service binding → this Worker</button>
        </div>
        {error && <p className="error">{error}</p>}
        {hello != null && <JsonView value={hello} />}
        <p className="small muted">The last button makes a round trip: your browser → Pages Function → <code>env.LAB.fetch()</code> → this Worker's Durable Object → back.</p>
      </Demo>

      <Demo title="Pages project layout">
        <pre className="code">{`cf-feature-lab-pages/
├── wrangler.jsonc            # pages_build_output_dir, KV + service binding
├── public/                   # served as-is (no build step)
│   ├── index.html, about.html, 404.html
│   ├── _headers              # security + cache headers by path
│   ├── _redirects            # 301/302 redirects and 200 rewrites
│   └── static/style.css, app.js
└── functions/                # file-based routes
    ├── _middleware.ts        # runs before everything
    └── api/
        ├── hello.ts          # GET /api/hello
        ├── visits.ts         # GET/POST /api/visits (shared KV)
        ├── greet/[name].ts   # GET /api/greet/:name
        └── lab/[[path]].ts   # GET /api/lab/* → service binding`}</pre>
      </Demo>
    </FeaturePage>
  );
}
