import { useState } from "react";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import source from "../../worker/routes/cache.ts?raw";

type Attempt = { n: number; cache: string; workerMs: number; totalMs: number; cachedAt: string | null; price: number };

export function Cache() {
  const [item, setItem] = useState("widget");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);

  const fetchItem = async () => {
    setBusy(true);
    const started = performance.now();
    // cache: "no-store" stops the *browser* cache, so we only see Cloudflare's cache.
    const res = await fetch(`/api/cache/item?item=${encodeURIComponent(item)}`, { cache: "no-store" });
    const body = await res.json();
    setAttempts((a) => [{
      n: a.length + 1,
      cache: res.headers.get("x-cache") ?? "?",
      workerMs: Number(res.headers.get("x-worker-ms")),
      totalMs: Math.round(performance.now() - started),
      cachedAt: res.headers.get("x-cached-at"),
      price: body.price,
    }, ...a].slice(0, 10));
    setBusy(false);
  };

  const purge = async () => {
    const r = await (await fetch(`/api/cache/item?item=${encodeURIComponent(item)}`, { method: "DELETE" })).json();
    setAttempts((a) => [{ n: a.length + 1, cache: r.purged ? "PURGED" : "NOT CACHED", workerMs: 0, totalMs: 0, cachedAt: null, price: 0 }, ...a].slice(0, 10));
  };

  return (
    <FeaturePage
      title="Cache API"
      tagline="Store responses in the Cloudflare data center closest to your users, and control them from code."
      docs="https://developers.cloudflare.com/workers/runtime-apis/cache/"
      whatItIs={<p>
        <code>caches.default</code> is a standard Web Cache API backed by Cloudflare's CDN cache in the location that
        served the request. <code>cache.put(request, response)</code> stores a response (honouring
        <code> Cache-Control</code>), <code>match()</code> reads it back, and <code>delete()</code> purges it. Each
        location has its own copy. For data that must be the same everywhere, use KV.
      </p>}
      whenToUse={[
        "Caching slow or expensive upstream API responses",
        "Custom cache keys, e.g. ignoring tracking query params",
        "Micro-caching dynamic pages for a few seconds under load",
      ]}
    >
      <Demo title="Slow origin vs cache">
        <p>The "origin" takes 1.2 seconds. The first request is a <strong>MISS</strong>: the Worker calls the origin and stores the result for 30 seconds. Repeat it and you get a <strong>HIT</strong> in about 1 ms, with the same price and timestamp. Purge it and the next request is slow again.</p>
        <div className="form-row">
          <label>Item (part of the cache key)<input value={item} onChange={(e) => setItem(e.target.value)} /></label>
          <button onClick={fetchItem} disabled={busy}>{busy ? "Fetching…" : "Fetch"}</button>
          <button className="ghost" onClick={purge}>Purge</button>
        </div>
        {attempts.length > 0 && (
          <table className="table">
            <thead><tr><th>#</th><th>Result</th><th>Worker time</th><th>Round trip</th><th>Price</th><th>Cached at</th></tr></thead>
            <tbody>{attempts.map((a) => (
              <tr key={a.n}>
                <td>{a.n}</td>
                <td><span className={`status status-${a.cache === "HIT" ? "done" : a.cache === "MISS" ? "retrying" : "dead"}`}>{a.cache}</span></td>
                <td>{a.cache === "HIT" || a.cache === "MISS" ? `${a.workerMs} ms` : ""}</td>
                <td className="muted">{a.totalMs ? `${a.totalMs} ms` : ""}</td>
                <td>{a.price ? `$${a.price.toFixed(2)}` : ""}</td>
                <td className="small muted">{a.cachedAt ? new Date(a.cachedAt).toLocaleTimeString() : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Demo>
      <CodePeek file="worker/routes/cache.ts" source={source} />
    </FeaturePage>
  );
}
