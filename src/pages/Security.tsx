import { useEffect, useState } from "react";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Turnstile } from "../components/Turnstile";
import turnstileSource from "../../worker/turnstile.ts?raw";
import { CodePeek } from "../components/CodePeek";
import adminSource from "../../worker/admin.ts?raw";
import accessSource from "../../worker/access.ts?raw";
import { adminHeaders, getAdminToken, setAdminToken } from "../adminToken";
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

  const [adminInput, setAdminInput] = useState(getAdminToken);
  const [adminResult, setAdminResult] = useState<unknown>(null);
  const checkAdmin = async (withToken: boolean) => {
    if (withToken) setAdminToken(adminInput.trim());
    const res = await fetch("/api/security/admin", { headers: withToken ? adminHeaders() : {} });
    setAdminResult({ status: res.status, ...(await res.json()) });
  };

  // Cloudflare Access: who does the Worker see?
  const [whoami, setWhoami] = useState<{ host: string; access: { email?: string; expiresAt?: string } | null; accessConfigured: boolean } | null>(null);
  const [accessAdmin, setAccessAdmin] = useState<unknown>(null);
  useEffect(() => { fetch("/api/security/whoami").then((r) => r.json()).then(setWhoami).catch(() => {}); }, []);
  const adminViaAccess = async () => {
    const res = await fetch("/api/security/admin"); // no token: only Access can let this in
    setAccessAdmin({ status: res.status, ...(await res.json()) });
  };

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

      <Demo title="4. Admin authentication with Secrets Store">
        <p>
          Some actions shouldn't be open to every visitor, such as wiping all queue jobs. Those routes need
          <code> Authorization: Bearer &lt;token&gt;</code>. The expected token isn't in the code or even in this Worker's own
          secrets. It's in the account-level <strong>Secrets Store</strong> (<code>await env.ADMIN_TOKEN.get()</code>), so several
          Workers can share it and it can be rotated in one place. The comparison runs in <strong>constant time</strong>, and failed
          attempts count toward the rate limit, so the token can't be guessed by timing or brute force.
        </p>
        <div className="form-row">
          <label className="grow">Admin token (kept in this tab only)<input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} autoComplete="off" /></label>
          <button onClick={() => checkAdmin(true)} disabled={!adminInput.trim()}>Check with token</button>
          <button className="ghost" onClick={() => checkAdmin(false)}>Try without a token</button>
          <button className="ghost" onClick={() => { setAdminToken(""); setAdminInput(""); setAdminResult(null); }}>Forget token</button>
        </div>
        {adminResult != null && <JsonView value={adminResult} />}
        <CodePeek file="worker/admin.ts" source={adminSource} />
      </Demo>

      <Demo title="5. Cloudflare Access: a login in front of a hostname">
        <p>
          <strong>admin.djmiskey.com</strong> runs this same Worker, but Cloudflare <strong>Access</strong> (Zero Trust) sits in front
          of it. Before any request reaches the Worker, Access asks you to log in (a one-time code sent to an allowed email).
          Then it forwards each request with a signed JWT in <code>Cf-Access-Jwt-Assertion</code>. The Worker verifies its
          signature, issuer and audience, and a valid login counts as admin, with no token needed. On any other hostname
          there's no Access token, and a faked header fails verification.
        </p>
        {whoami && (
          <p className="small">
            You're on <code>{whoami.host}</code>.{" "}
            {whoami.access
              ? <>Access says you're <strong>{whoami.access.email}</strong> (login valid until {whoami.access.expiresAt ? new Date(whoami.access.expiresAt).toLocaleTimeString() : "?"}).</>
              : whoami.accessConfigured
                ? <>No Access login on this hostname. Open <a href="https://admin.djmiskey.com/security">admin.djmiskey.com/security</a> to log in.</>
                : <>Access isn't configured on this Worker yet.</>}
          </p>
        )}
        <div className="form-row">
          <button onClick={adminViaAccess}>Call the admin route with no token</button>
          <span className="small muted">Works only on admin.djmiskey.com after logging in. Anywhere else: 401.</span>
        </div>
        {accessAdmin != null && <JsonView value={accessAdmin} />}
        <CodePeek file="worker/access.ts" source={accessSource} />
      </Demo>

      <Demo title="Coming next">
        <ul className="small">
          <li><strong>Zone features on djmiskey.com</strong>: live WAF and edge rate-limit demos on this page</li>
        </ul>
      </Demo>
    </FeaturePage>
  );
}
