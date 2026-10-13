import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Link } from "../router";
import source from "../../worker/routes/vectorize.ts?raw";

type Match = { score: number; note: { id: number; author: string; body: string; tag: string } };

export function Vectorize() {
  const [info, setInfo] = useState<{ vectorCount: number; dimensions: number } | null>(null);
  const [sync, setSync] = useState<unknown>(null);
  const [q, setQ] = useState("which storage has free downloads?");
  const [tag, setTag] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [question, setQuestion] = useState("Why do Workers start so fast?");
  const [answer, setAnswer] = useState<{ answer: string; sources: Match[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadInfo = () => api<{ vectorCount: number; dimensions: number }>("/vectorize/info").then(setInfo);
  useEffect(() => { loadInfo().catch((e) => setError(e.message)); }, []);

  const guard = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    setBusy("");
  };

  const doSync = guard("sync", async () => {
    setSync(await api("/vectorize/sync", { method: "POST" }));
    // Vectorize processes writes asynchronously. Refresh the count shortly after.
    setTimeout(loadInfo, 4000);
  });
  const doSearch = guard("search", async () => {
    const params = new URLSearchParams({ q, ...(tag ? { tag } : {}) });
    setMatches((await api<{ matches: Match[] }>(`/vectorize/search?${params}`)).matches);
  });
  const doAsk = guard("ask", async () => {
    setAnswer(await api("/vectorize/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) }));
  });

  return (
    <FeaturePage
      title="Vectorize"
      tagline="A vector database for searching by meaning, built for embeddings from Workers AI."
      docs="https://developers.cloudflare.com/vectorize/"
      whatItIs={<p>
        Vectorize stores vectors (embeddings) with an ID and optional metadata, and finds the nearest ones to a
        query vector. Combined with Workers AI embeddings, that gives you <strong>semantic search</strong>:
        "free downloads" finds a note about "zero egress fees". Writes are asynchronous and become searchable
        within seconds. Free plan: 30M queried and 5M stored vector dimensions per month.
      </p>}
      whenToUse={[
        "Semantic search over docs, products or support tickets",
        "RAG: give an LLM the relevant facts before it answers",
        "Recommendations and finding duplicates",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="1. Index the D1 notes">
        <p>
          This reads every note from <Link to="/d1">D1</Link>, embeds each one with <code>bge-base-en-v1.5</code>,
          and upserts it as <code>note-&lt;id&gt;</code> with <code>{"{ noteId, tag }"}</code> metadata.
          Add notes on the D1 page, then sync again.
        </p>
        <div className="form-row">
          <button onClick={doSync} disabled={busy === "sync"}>{busy === "sync" ? "Embedding…" : "Sync notes → Vectorize"}</button>
          <button className="ghost" onClick={guard("info", loadInfo)}>Refresh count</button>
          {info && <span className="small muted">Index: {info.vectorCount} vectors · {info.dimensions} dimensions · cosine</span>}
        </div>
        {sync != null && <JsonView value={sync} />}
      </Demo>

      <Demo title="2. Semantic search">
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
          <label className="grow">Search by meaning<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label>Metadata filter: tag<input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="any" /></label>
          <button type="submit" disabled={!q.trim() || busy === "search"}>Search</button>
        </form>
        {matches && (matches.length === 0
          ? <p className="muted">No matches. Have you synced the notes?</p>
          : <table className="table">
              <thead><tr><th>Score</th><th>Note</th><th>Tag</th></tr></thead>
              <tbody>{matches.map((m) => (
                <tr key={m.note.id}><td><strong>{m.score.toFixed(3)}</strong></td><td>{m.note.body}</td><td><code>{m.note.tag}</code></td></tr>
              ))}</tbody>
            </table>)}
      </Demo>

      <Demo title="3. Ask your notes (RAG)">
        <p>Retrieval-augmented generation: find the 3 closest notes, give them to the LLM as context, and have it answer only from them, with citations. Off-topic questions get "I don't know".</p>
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); doAsk(); }}>
          <label className="grow">Question<input value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
          <button type="submit" disabled={!question.trim() || busy === "ask"}>{busy === "ask" ? "Thinking…" : "Ask"}</button>
        </form>
        {answer && <>
          <div className="ai-output">{answer.answer}</div>
          <ol className="sources small">{answer.sources.map((s) => <li key={s.note.id}>{s.note.body} <span className="muted">({s.score.toFixed(3)})</span></li>)}</ol>
        </>}
      </Demo>

      <CodePeek file="worker/routes/vectorize.ts" source={source} />
    </FeaturePage>
  );
}
