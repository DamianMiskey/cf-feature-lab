import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/hyperdrive.ts?raw";

type Product = { id: number; name: string; price: string; created_at: string };
type Run = { connectMs: number; totalMs: number };
type Compare = { hyperdrive: Run[]; direct: Run[] | null; colo: string };

function Timings({ label, runs, max }: { label: string; runs: Run[]; max: number }) {
  return (
    <div className="timings">
      <strong className="small">{label}</strong>
      {runs.map((r, i) => (
        <div key={i} className="bar-row">
          <span className="small muted">Run {i + 1}</span>
          <div className="bar"><div style={{ width: `${Math.max((r.totalMs / max) * 100, 1)}%` }} /></div>
          <span className="small">{r.totalMs} ms</span>
        </div>
      ))}
    </div>
  );
}

export function Hyperdrive() {
  const [products, setProducts] = useState<Product[]>([]);
  const [timing, setTiming] = useState<{ connectMs: number; totalMs: number } | null>(null);
  const [form, setForm] = useState({ name: "", price: "" });
  const [compare, setCompare] = useState<Compare | null>(null);
  const [info, setInfo] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const guard = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    setBusy("");
  };
  const load = guard("load", async () => {
    const r = await api<{ products: Product[]; connectMs: number; totalMs: number }>("/hyperdrive/products");
    setProducts(r.products);
    setTiming(r);
  });
  useEffect(() => { load(); }, []);

  const add = guard("add", async () => {
    await api("/hyperdrive/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.name, price: Number(form.price) }) });
    setForm({ name: "", price: "" });
    const r = await api<{ products: Product[] }>("/hyperdrive/products");
    setProducts(r.products);
  });
  const remove = (id: number) => guard("remove", async () => {
    await api(`/hyperdrive/products/${id}`, { method: "DELETE" });
    setProducts((p) => p.filter((x) => x.id !== id));
  })();
  const runCompare = guard("compare", async () => setCompare(await api<Compare>("/hyperdrive/compare")));
  const loadInfo = guard("info", async () => setInfo(await api("/hyperdrive/info")));

  const max = compare ? Math.max(...compare.hyperdrive.map((r) => r.totalMs), ...(compare.direct ?? []).map((r) => r.totalMs), 1) : 1;
  const isLocal = compare?.colo === "local" || location.hostname === "localhost";

  return (
    <FeaturePage
      title="Hyperdrive"
      tagline="Make an existing Postgres or MySQL database fast from Workers, with no code changes."
      docs="https://developers.cloudflare.com/hyperdrive/"
      whatItIs={<p>
        Opening a database connection takes several round trips (TCP, TLS, auth). From a Worker far from
        the database, that's often 1–2 seconds <em>per request</em>. Hyperdrive keeps a <strong>pool of warm connections</strong>
        near your database and gives your Worker a connection string that resolves to the nearest Cloudflare
        location, so connecting is fast. It also <strong>caches read queries</strong>. You use your normal driver (here
        <code> pg</code>, which Neon recommends for Cloudflare). This page uses a free <strong>Neon</strong> Postgres database.
      </p>}
      whenToUse={[
        "You already have Postgres or MySQL (Neon, Supabase, RDS, PlanetScale…) and want it fast from Workers",
        "Read-heavy queries that benefit from caching",
        "Keeping connection counts low on your database",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="1. Direct vs Hyperdrive">
        <p>The same <code>SELECT</code> runs 3 times each way, with a <strong>new connection every time</strong>, like separate Worker requests. Direct pays the full handshake with Neon's region on every run. Hyperdrive connects to the nearby edge and reuses pooled connections, and repeat reads can come from its cache.</p>
        <button onClick={runCompare} disabled={busy === "compare"}>{busy === "compare" ? "Running 6 queries…" : "Run comparison"}</button>
        {compare && <>
          <Timings label="Through Hyperdrive" runs={compare.hyperdrive} max={max} />
          {compare.direct ? <Timings label="Direct to Neon (no Hyperdrive)" runs={compare.direct} max={max} /> : <p className="small muted">Set the <code>NEON_DATABASE_URL</code> secret to compare with a direct connection.</p>}
          <p className="small muted">Worker ran in: <code>{compare.colo}</code></p>
          {isLocal && <p className="small">⚠️ In local dev, Hyperdrive has no Cloudflare pool and connects straight to Neon, so both rows look the same. Open this page on the deployed site to see the real difference.</p>}
        </>}
      </Demo>

      <Demo title={`2. Products table in Neon (${products.length})`}>
        {timing && <p className="small muted">Last read: connect {timing.connectMs} ms · total {timing.totalMs} ms</p>}
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <label className="grow">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Price<input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" /></label>
          <button type="submit" disabled={!form.name || form.price === "" || busy === "add"}>Insert</button>
          <button type="button" className="ghost" onClick={load}>Refresh</button>
        </form>
        <table className="table">
          <thead><tr><th>id</th><th>name</th><th>price</th><th>created_at</th><th /></tr></thead>
          <tbody>{products.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td><td>{p.name}</td><td>${p.price}</td>
              <td className="small muted">{new Date(p.created_at).toLocaleString()}</td>
              <td className="actions"><button className="ghost" onClick={() => remove(p.id)}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="small muted">Writes always go to the database. Only reads are cached, for up to 60 seconds by default, so a list can briefly look stale after a write.</p>
      </Demo>

      <Demo title="3. Which database is this?">
        <button className="ghost" onClick={loadInfo}>SELECT version(), current_database(), now()</button>
        {info != null && <JsonView value={info} />}
        <p className="small muted"><code>now()</code> is volatile, so Hyperdrive never caches this query.</p>
      </Demo>

      <CodePeek file="worker/routes/hyperdrive.ts" source={source} />
    </FeaturePage>
  );
}
