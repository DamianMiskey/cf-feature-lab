import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/kv.ts?raw";

type KeyInfo = { name: string; expiration?: number; metadata?: Record<string, unknown> };

export function Kv() {
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [key, setKey] = useState("greeting");
  const [value, setValue] = useState("Hello from the edge!");
  const [ttl, setTtl] = useState("");
  const [read, setRead] = useState<unknown>(null);
  const [error, setError] = useState("");

  const refresh = () => api<{ keys: KeyInfo[] }>("/kv").then((r) => setKeys(r.keys)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const guard = (fn: () => Promise<void>) => async () => {
    setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  const save = guard(async () => {
    await api(`/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, ttl: ttl ? Number(ttl) : undefined, metadata: { source: "feature-lab" } }),
    });
    await refresh();
  });
  const load = (k: string) => guard(async () => setRead(await api(`/kv/${encodeURIComponent(k)}`)))();
  const remove = (k: string) => guard(async () => {
    await api(`/kv/${encodeURIComponent(k)}`, { method: "DELETE" });
    await refresh();
  })();

  return (
    <FeaturePage
      title="Workers KV"
      tagline="A global key-value store that's cached close to every user and built for read-heavy data."
      docs="https://developers.cloudflare.com/kv/"
      whatItIs={<p>
        KV stores strings, JSON or binary values (up to 25 MiB) under string keys, with optional
        <strong> TTLs</strong> and <strong>metadata</strong>. Reads are very fast because values are cached
        in the data center that serves them. Writes are <strong>eventually consistent</strong>: another
        region can keep seeing the old value for up to about 60 seconds. Free plan: 100k reads and 1k writes per day.
      </p>}
      whenToUse={[
        "Config, feature flags, redirects, allow/deny lists",
        "Caching API responses or rendered fragments",
        "Session tokens. Not for counters or anything needing read-after-write consistency (use Durable Objects).",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="Write a key">
        <div className="form-row">
          <label>Key<input value={key} onChange={(e) => setKey(e.target.value)} /></label>
          <label className="grow">Value<input value={value} onChange={(e) => setValue(e.target.value)} /></label>
          <label>TTL (s, ≥60)<input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="none" inputMode="numeric" /></label>
          <button onClick={save} disabled={!key}>Put</button>
        </div>
      </Demo>

      <Demo title={`Keys (${keys.length})`}>
        <p>Listed with <code>KV.list({"{ prefix }"})</code>. Listing returns names, expiry and metadata, but not values. A key you just wrote can take a moment to show up here, because listing is eventually consistent too.</p>
        <table className="table">
          <thead><tr><th>Key</th><th>Expires</th><th>Metadata</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.name}>
                <td><code>{k.name}</code></td>
                <td>{k.expiration ? new Date(k.expiration * 1000).toLocaleTimeString() : "never"}</td>
                <td className="muted small">{JSON.stringify(k.metadata)}</td>
                <td className="actions">
                  <button className="ghost" onClick={() => load(k.name)}>Get</button>
                  <button className="ghost" onClick={() => remove(k.name)}>Delete</button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && <tr><td colSpan={4} className="muted">No keys yet. Write one above.</td></tr>}
          </tbody>
        </table>
        <button className="ghost" onClick={refresh}>Refresh</button>
        {read != null && <JsonView value={read} />}
      </Demo>

      <CodePeek file="worker/routes/kv.ts" source={source} />
    </FeaturePage>
  );
}
