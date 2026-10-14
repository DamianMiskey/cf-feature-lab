import { useState } from "react";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Turnstile } from "../components/Turnstile";
import turnstileSource from "../../worker/turnstile.ts?raw";
import { CodePeek } from "../components/CodePeek";
import headersFile from "../../public/_headers?raw";

const HEADERS: [string, string][] = [
  ["content-security-policy", "Which sources may load scripts, styles, images and connections. The main defence against cross-site scripting (XSS)."],
  ["strict-transport-security", "Browsers must always use HTTPS for this site, even if someone types http://."],
  ["x-content-type-options", "nosniff: browsers must trust the declared content type and never guess. Stops a text file being run as a script."],
  ["x-frame-options", "Nobody may put this site in an iframe. Prevents clickjacking. (frame-ancestors in the CSP is the modern version.)"],
  ["referrer-policy", "How much of the URL is shared when you follow a link to another site."],
  ["permissions-policy", "Turns off browser features the site never needs: camera, microphone, location…"],
  ["cross-origin-opener-policy", "Isolates this page from windows opened by other sites."],
  ["cross-origin-resource-policy", "Only this site may load the API's responses."],
];

type Probe = Record<string, Record<string, string | null>>;

export function Security() {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [attacks, setAttacks] = useState<unknown>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [verdict, setVerdict] = useState<unknown>(null);

  const verify = async (send: string | null) => {
    const res = await fetch("/api/security/turnstile/verify", { method: "POST", headers: { "cf-turnstile-response": send ?? "" } });
    setVerdict({ status: res.status, ...(await res.json()) });
    setResetKey((k) => k + 1);
  };

  const runProbe = async () => {
    const out: Probe = {};
    for (const path of ["/", "/api/health"]) {
      const res = await fetch(path, { cache: "no-store" });
      out[path] = Object.fromEntries(HEADERS.map(([h]) => [h, res.headers.get(h)]));
    }
    setProbe(out);
  };

  const runAttacks = async () => {
    const ssrf = await fetch(`/api/browser/inspect?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`);
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"/>'], { type: "image/svg+xml" });
    const upload = await fetch("/api/r2/evil.svg", { method: "PUT", body: svg, headers: { "content-type": "image/svg+xml" } });
    setAttacks({
      "SSRF: render the cloud metadata address 169.254.169.254": { status: ssrf.status, ...(await ssrf.json()) },
      "Stored XSS: upload an SVG with an onload script": { status: upload.status, ...(await upload.json()) },
    });
  };

  return (
    <FeaturePage
      title="Security"
      tagline="Layers of protection: headers, input checks, bot checks, authentication, and (with a domain) Cloudflare's edge security."
      docs="https://developers.cloudflare.com/workers/examples/security-headers/"
      whatItIs={<p>
        Security on Cloudflare comes in layers. Some live in <strong>your code</strong>: security headers, input
        validation, authentication. Some are <strong>platform features</strong> you switch on: rate limiting (see its own page),
        Turnstile, Access, Secrets Store. Others protect a whole <strong>domain</strong> before requests ever reach your
        Worker: WAF rules, Bot Fight Mode, DDoS protection and SSL/TLS settings. This page grows with each layer.
      </p>}
      whenToUse={[
        "Every site: security headers and input validation cost nothing",
        "Public forms: rate limits + Turnstile",
        "Admin areas: real authentication (Access or tokens)",
      ]}
    >
      <Demo title="1. Security headers">
        <p>
          Static files get headers from <code>public/_headers</code>. API responses get them from Hono's
          <code> secureHeaders()</code> middleware with a lock-everything CSP, because JSON is data, not a page.
          Check what this page actually received:
        </p>
        <button onClick={runProbe}>Inspect response headers</button>
        {probe && (
          <table className="table">
            <thead><tr><th>Header</th><th>Page (/)</th><th>API (/api/health)</th></tr></thead>
            <tbody>{HEADERS.map(([h, why]) => (
              <tr key={h}>
                <td><code>{h}</code><div className="small muted">{why}</div></td>
                <td className="small">{probe["/"][h] ?? <span className="muted">—</span>}</td>
                <td className="small">{probe["/api/health"][h] ?? <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <details className="small"><summary>public/_headers</summary><pre className="code">{headersFile}</pre></details>
      </Demo>

      <Demo title="2. Input hardening: try two attacks">
        <p>
          <strong>SSRF:</strong> Browser Run refuses private, loopback and link-local addresses, so it can't be pointed at
          internal services or cloud metadata endpoints. <strong>Stored XSS:</strong> R2 uploads use an allow-list of file
          types. SVG isn't on it, because an SVG can carry JavaScript that would run on this origin. Files that aren't
          safe to display download instead of rendering.
        </p>
        <button onClick={runAttacks}>Attempt both attacks</button>
        {attacks != null && <JsonView value={attacks} />}
      </Demo>

      <Demo title="3. Turnstile: bot checks without puzzles">
        <p>
          Turnstile runs invisible browser checks and only shows a checkbox when it's unsure. The widget gives the page a
          <strong> token</strong>. The Worker sends it to Cloudflare's <code>siteverify</code> API with the secret key, and accepts
          the request only if it's valid, unused, issued for <em>this</em> action and <em>this</em> hostname. Adding notes (D1)
          and uploading files (R2) now require it. Locally, Cloudflare's test keys always pass.
        </p>
        <Turnstile action="demo" onToken={setToken} resetKey={resetKey} />
        <div className="form-row">
          <button onClick={() => verify(token)} disabled={!token}>Verify my token</button>
          <button className="ghost" onClick={() => verify(null)}>Send without a token (like a bot)</button>
        </div>
        {verdict != null && <JsonView value={verdict} />}
        <CodePeek file="worker/turnstile.ts" source={turnstileSource} />
      </Demo>

      <Demo title="Coming next">
        <ul className="small">
          <li><strong>Admin authentication</strong>: destructive endpoints need a token, compared in constant time</li>
          <li><strong>Secrets Store</strong>: account-level secrets shared between Workers</li>
          <li><strong>Cloudflare Access</strong>: a login gate in front of an admin hostname</li>
          <li><strong>djmiskey.com</strong>: WAF custom rules, Bot Fight Mode, edge rate-limiting rules, SSL/TLS settings</li>
        </ul>
      </Demo>
    </FeaturePage>
  );
}
