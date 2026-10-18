import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import source from "../../worker/routes/ai.ts?raw";

// Reads the server-sent event stream from /api/ai/chat and calls onToken for each chunk.
async function streamChat(prompt: string, onToken: (t: string) => void) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event.replace(/^data: /, "").trim();
      if (!data || data === "[DONE]") continue;
      try { onToken(JSON.parse(data).response ?? ""); } catch { /* partial event */ }
    }
  }
}

function ChatDemo() {
  const [prompt, setPrompt] = useState("Explain Cloudflare Workers to a 10-year-old.");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [firstTokenMs, setFirstTokenMs] = useState<number | null>(null);

  const run = async () => {
    setAnswer(""); setError(""); setBusy(true); setFirstTokenMs(null);
    const started = performance.now();
    let first = true;
    try {
      await streamChat(prompt, (t) => {
        if (first) { setFirstTokenMs(Math.round(performance.now() - started)); first = false; }
        setAnswer((a) => a + t);
      });
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <Demo title="1. Text generation, streamed">
      <p>The Worker calls <code>env.AI.run(model, {"{ messages, stream: true }"})</code> and pipes the token stream straight to your browser as server-sent events.</p>
      <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="grow">Prompt<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <button type="submit" disabled={busy || !prompt.trim()}>{busy ? "Generating…" : "Ask"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {(answer || busy) && <div className="ai-output">{answer}{busy && <span className="cursor">▍</span>}</div>}
      {firstTokenMs != null && <p className="muted small">First token after {firstTokenMs} ms</p>}
    </Demo>
  );
}

function ClassifyDemo() {
  const [preview, setPreview] = useState("");
  const [labels, setLabels] = useState<{ label: string; score: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file?: File) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file)); setLabels([]); setError(""); setBusy(true);
    try {
      const r = await api<{ labels: { label: string; score: number }[] }>("/ai/classify", { method: "POST", body: file });
      setLabels(r.labels);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <Demo title="2. Image classification">
      <p>Upload a photo. <code>resnet-50</code> picks the most likely of 1,000 everyday categories.</p>
      <input type="file" accept="image/*" aria-label="Image to classify" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p className="error">{error}</p>}
      {preview && (
        <div className="classify">
          <img src={preview} alt="Uploaded" />
          <div className="bars">
            {busy && <p className="muted">Classifying…</p>}
            {labels.map((l) => (
              <div key={l.label} className="bar-row">
                <span className="small">{l.label.toLowerCase()}</span>
                <div className="bar"><div style={{ width: `${Math.max(l.score * 100, 1)}%` }} /></div>
                <span className="small muted">{(l.score * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Demo>
  );
}

function ImageDemo() {
  const [prompt, setPrompt] = useState("A tiny orange cloud wearing headphones, 3D render");
  const [result, setResult] = useState<{ dataUrl: string; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true); setError("");
    try {
      setResult(await api("/ai/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) }));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <Demo title="3. Text-to-image">
      <p><code>flux-1-schnell</code> creates an image in 4 steps. Each image uses a noticeable share of the free daily neurons, so go easy.</p>
      <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="grow">Prompt<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <button type="submit" disabled={busy || !prompt.trim()}>{busy ? "Painting…" : "Generate"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && <figure className="generated"><img src={result.dataUrl} alt={prompt} /><figcaption className="muted small">{result.ms} ms</figcaption></figure>}
    </Demo>
  );
}

function EmbedDemo() {
  const [a, setA] = useState("How do I store user uploads?");
  const [b, setB] = useState("R2 is object storage for files.");
  const [result, setResult] = useState<{ cosineSimilarity: number } | null>(null);
  const run = async () => setResult(await api("/ai/embed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a, b }) }));
  return (
    <Demo title="4. Embeddings: meaning as numbers">
      <p>Each text becomes a 768-number vector. Cosine similarity close to 1 means similar meaning, even with no words in common. Try two unrelated sentences.</p>
      <div className="form-row">
        <label className="grow">Text A<input value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="grow">Text B<input value={b} onChange={(e) => setB(e.target.value)} /></label>
        <button onClick={run}>Compare</button>
      </div>
      {result && <>
        <p>Similarity: <strong className="big-number">{result.cosineSimilarity.toFixed(3)}</strong></p>
        <JsonView value={result} />
      </>}
    </Demo>
  );
}

export function Ai() {
  return (
    <FeaturePage
      title="Workers AI"
      tagline="Run open models on Cloudflare's GPUs with one line of code and no API keys."
      docs="https://developers.cloudflare.com/workers-ai/"
      whatItIs={<p>
        The <code>AI</code> binding gives your Worker access to a catalog of models: text generation, embeddings,
        image classification, text-to-image, speech, translation and more (<code>npx wrangler ai models list</code>).
        You call <code>env.AI.run(model, input)</code>. Usage is measured in <strong>neurons</strong>, and the
        free plan includes 10,000 per day. AI runs remotely even during <code>npm run dev</code>.
      </p>}
      whenToUse={[
        "Chatbots, summaries, classification or extraction inside your app",
        "Embeddings for search and RAG (see Vectorize)",
        "Image and audio features without managing GPUs",
      ]}
    >
      <ChatDemo />
      <ClassifyDemo />
      <ImageDemo />
      <EmbedDemo />
      <CodePeek file="worker/routes/ai.ts" source={source} />
    </FeaturePage>
  );
}
