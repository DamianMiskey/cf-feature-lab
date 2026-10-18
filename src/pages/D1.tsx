import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Turnstile } from "../components/Turnstile";
import source from "../../worker/routes/d1.ts?raw";
import migration from "../../migrations/0001_notes.sql?raw";

type Note = { id: number; author: string; body: string; tag: string; created_at: string };
type Meta = { duration: number; rows_read: number; rows_written: number; served_by?: string };

export function D1() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tag, setTag] = useState("");
  const [form, setForm] = useState({ author: "", body: "", tag: "" });
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState("");

  const refresh = async (filter = tag) => {
    const r = await api<{ notes: Note[]; meta: Meta }>(`/d1/notes${filter ? `?tag=${encodeURIComponent(filter)}` : ""}`);
    setNotes(r.notes);
    setMeta(r.meta);
  };
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  const guard = (fn: () => Promise<void>) => async () => {
    setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
  };

  // Public writes need a Turnstile token (see the Security page).
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const add = guard(async () => {
    try {
      await api("/d1/notes", { method: "POST", headers: { "content-type": "application/json", "cf-turnstile-response": token ?? "" }, body: JSON.stringify(form) });
    } finally {
      setResetKey((k) => k + 1); // tokens are single-use
    }
    setForm({ ...form, body: "" });
    await refresh();
  });
  const remove = (id: number) => guard(async () => { await api(`/d1/notes/${id}`, { method: "DELETE" }); await refresh(); })();
  const runAndRefresh = (path: string, method = "POST") => guard(async () => { setOutput(await api(path, { method })); await refresh(); });

  return (
    <FeaturePage
      title="D1"
      tagline="Cloudflare's serverless SQL database, built on SQLite."
      docs="https://developers.cloudflare.com/d1/"
      whatItIs={<p>
        Each D1 database is a SQLite database managed by Cloudflare. You query it with prepared
        statements, change its schema with <strong>migrations</strong> (plain <code>.sql</code> files),
        and can restore it to any minute in the last 30 days with <strong>Time Travel</strong>
        (<code>wrangler d1 time-travel</code>). Read replicas can serve reads close to users.
        Free plan: 5M rows read and 100k rows written per day, 5 GB storage.
      </p>}
      whenToUse={[
        "Relational app data: users, orders, content",
        "Many small databases, such as one per tenant",
        "Anything you'd reach for SQLite or Postgres for, when you want it serverless",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="Insert a row">
        <Turnstile action="add-note" onToken={setToken} resetKey={resetKey} />
        <div className="form-row">
          <label>Author<input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></label>
          <label className="grow">Note<input value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
          <label>Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="general" /></label>
          <button onClick={add} disabled={!form.author || !form.body || !token}>Insert</button>
        </div>
      </Demo>

      <Demo title={`SELECT * FROM notes (${notes.length})`}>
        <div className="form-row">
          <label>Filter by tag (WHERE tag = ?)<input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="any" /></label>
          <button className="ghost" onClick={guard(() => refresh())}>Query</button>
        </div>
        {meta && (
          <p className="muted small">
            meta: {meta.rows_read} rows read · {meta.rows_written} written · {meta.duration.toFixed(2)} ms in the database
            {meta.served_by ? ` · served by ${meta.served_by}` : ""}
          </p>
        )}
        <table className="table">
          <thead><tr><th>id</th><th>author</th><th>body</th><th>tag</th><th>created_at</th><th /></tr></thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td>{n.id}</td><td>{n.author}</td><td>{n.body}</td><td><code>{n.tag}</code></td>
                <td className="muted small">{n.created_at}</td>
                <td className="actions"><button className="ghost" onClick={() => remove(n.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Demo>

      <Demo title="Batches are transactions">
        <p><code>DB.batch([...])</code> sends several statements in one round trip and applies them all or none.</p>
        <div className="form-row">
          <button onClick={runAndRefresh("/d1/batch")}>Run a successful batch</button>
          <button className="ghost" onClick={runAndRefresh("/d1/batch-fail")}>Run a failing batch (watch it roll back)</button>
          <button className="ghost" onClick={runAndRefresh("/d1/stats", "GET")}>GROUP BY tag</button>
        </div>
        {output != null && <JsonView value={output} />}
      </Demo>

      <Demo title="The migration that created this table">
        <pre className="code" tabIndex={0}>{migration}</pre>
        <p className="muted small">Apply locally with <code>npx wrangler d1 migrations apply DB --local</code>, and in production with <code>--remote</code>. D1 records applied migrations in a <code>d1_migrations</code> table.</p>
      </Demo>

      <CodePeek file="worker/routes/d1.ts" source={source} />
    </FeaturePage>
  );
}
