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

  // Zone features: these run against whatever hostname you're on.
  const [trace, setTrace] = useState<Record<string, string> | null>(null);
  const [waf, setWaf] = useState<unknown>(null);
  const [burstResult, setBurstResult] = useState<Record<string, number> | null>(null);
  const [bursting, setBursting] = useState(false);

  const loadTrace = async () => {
    // Cloudflare answers /cdn-cgi/trace itself, for any hostname in a zone.
    const text = await (await fetch("/cdn-cgi/trace", { cache: "no-store" })).text();
    setTrace(Object.fromEntries(text.trim().split("\n").map((l) => l.split("=") as [string, string])));
  };
  const probeWaf = async () => {
    const out: Record<string, unknown> = {};
    for (const path of ["/.env", "/wp-admin/", "/.git/config", "/api/health"]) {
      const res = await fetch(path, { cache: "no-store" });
      const body = await res.text();
      out[path] = { status: res.status, blockedByWaf: body.includes("Sorry, you have been blocked") };
    }
    setWaf(out);
  };
  const burst = async () => {
    setBursting(true);
    const statuses = await Promise.all(Array.from({ length: 30 }, () => fetch("/api/health", { cache: "no-store" }).then((r) => r.status).catch(() => 0)));
    setBurstResult(statuses.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {}));
    setBursting(false);
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
      tagline="Layers of protection: headers, input checks, bot checks, authentication, and Cloudflare's edge security on djmiskey.com."
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

      <Demo title="6. Zone features on djmiskey.com">
        <p>
          These protections run in Cloudflare's network <strong>before a request reaches the Worker</strong>, and they apply to
          every hostname in the <code>djmiskey.com</code> zone. They're configured in the dashboard, not in code. That's also
          why <code>workers.dev</code> is switched off: it isn't in the zone, so none of this protected it.
        </p>
        <table className="table">
          <thead><tr><th>Setting</th><th>What it does here</th></tr></thead>
          <tbody>
            <tr><td><strong>WAF custom rule</strong></td><td className="small">Blocks paths that only attackers probe: <code>/.env</code>, <code>/wp-admin</code>, <code>/.git</code></td></tr>
            <tr><td><strong>Rate limiting rule</strong></td><td className="small">More than 20 <code>/api/</code> requests in 10 s from one IP → blocked for 10 s, at the edge</td></tr>
            <tr><td><strong>Always Use HTTPS</strong></td><td className="small"><code>http://</code> requests get a 301 to <code>https://</code></td></tr>
            <tr><td><strong>Minimum TLS 1.2</strong></td><td className="small">TLS 1.0 and 1.1 handshakes are refused</td></tr>
            <tr><td><strong>Cloudflare Access</strong></td><td className="small">A login in front of <code>admin.djmiskey.com</code> (section 5)</td></tr>
            <tr><td><strong>Web Analytics</strong></td><td className="small">A privacy-first analytics beacon (no cookies): real-user page load times and Core Web Vitals. Loaded by the app itself and reporting to this site's own <code>/cdn-cgi/rum</code>, so the CSP only allows its script domain.</td></tr>
          </tbody>
        </table>

        <p className="small">
          <strong>Scripts Cloudflare adds by itself:</strong> on a zone hostname, some features change your HTML on the way
          out. Web Analytics adds a beacon, and Bot Fight Mode adds an inline <em>JavaScript Detections</em> script. A strict CSP
          blocks anything it doesn't expect, including these. So the lab sends <code>Cache-Control: no-transform</code>, which tells Cloudflare not to modify its pages, and loads Web Analytics itself. Other options: allow each script explicitly, or use a
          per-request <em>nonce</em> in the CSP header, which Cloudflare copies onto its injected scripts. Never fall back to
          <code> 'unsafe-inline'</code>.
        </p>

        <h3 className="small">Your connection, as Cloudflare sees it</h3>
        <button className="ghost" onClick={loadTrace}>Read /cdn-cgi/trace</button>
        {trace && (
          <p className="small">
            TLS <strong>{trace.tls}</strong> · HTTP <strong>{trace.http}</strong> · key exchange <strong>{trace.kex}</strong>
            {trace.kex?.includes("MLKEM") ? " (post-quantum!)" : ""} · data center <strong>{trace.colo}</strong> · country <strong>{trace.loc}</strong>
          </p>
        )}

        <h3 className="small">Trigger the WAF rule</h3>
        <button className="ghost" onClick={probeWaf}>Request /.env, /wp-admin/, /.git/config and /api/health</button>
        {waf != null && <JsonView value={waf} />}

        <h3 className="small">Trigger the edge rate limit</h3>
        <p className="small muted">Sends 30 API requests at once. Expect about 20 to pass and the rest to get 429 from Cloudflare's edge. The lab's API is then blocked for you for about 10 seconds.</p>
        <button className="ghost" onClick={burst} disabled={bursting}>{bursting ? "Sending…" : "Send 30 requests"}</button>
        {burstResult && <p className="small">{Object.entries(burstResult).map(([code, n]) => `${n} × ${code}`).join(" · ")}</p>}
      </Demo>
    </FeaturePage>
  );
}
