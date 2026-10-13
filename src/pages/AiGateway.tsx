import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import source from "../../worker/routes/ai.ts?raw";

type Run = { ms: number; logId: string | null; response?: string };

export function AiGateway() {
  const [prompt, setPrompt] = useState("Name three Cloudflare storage products.");
  const [result, setResult] = useState<{ gateway: string; first: Run; second: Run } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true); setError("");
    try {
      setResult(await api("/ai/gateway", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) }));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <FeaturePage
      title="AI Gateway"
      tagline="One place to see, cache, limit and control every AI request your app makes."
      docs="https://developers.cloudflare.com/ai-gateway/"
      whatItIs={<p>
        AI Gateway is a proxy between your app and AI providers: Workers AI, OpenAI, Anthropic and others.
        With the AI binding you opt in by passing <code>{"{ gateway: { id } }"}</code> to <code>env.AI.run()</code>.
        Every call is then <strong>logged</strong> (prompt, response, tokens, cost, latency), and you can turn on
        <strong> caching</strong>, <strong>rate limiting</strong>, retries and model fallbacks. Every AI call in
        this lab goes through the <code>default</code> gateway, which was created automatically on first use.
      </p>}
      whenToUse={[
        "Seeing what your AI features cost and how they perform",
        "Caching repeated prompts to save money and time",
        "Rate limiting AI usage, or switching providers without code changes",
      ]}
    >
      {error && <p className="error">{error}</p>}
      <Demo title="Caching: the same prompt, twice">
        <p>The Worker sends this prompt through the gateway twice, with <code>cacheTtl: 300</code>. The first call runs the model. The second is answered from the gateway's cache without running it. Run the same prompt again within 5 minutes and both are cache hits.</p>
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <label className="grow">Prompt<input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
          <button type="submit" disabled={busy || !prompt.trim()}>{busy ? "Running twice…" : "Run"}</button>
        </form>
        {result && (
          <table className="table">
            <thead><tr><th>Call</th><th>Time</th><th>Gateway log ID</th></tr></thead>
            <tbody>
              {(["first", "second"] as const).map((k) => (
                <tr key={k}><td>{k}</td><td><strong>{result[k].ms} ms</strong></td><td className="small"><code>{result[k].logId}</code></td></tr>
              ))}
            </tbody>
          </table>
        )}
        {result?.second.response && <div className="ai-output">{result.second.response}</div>}
      </Demo>
      <Demo title="See it in the dashboard">
        <p>Open <strong>Cloudflare dashboard → AI → AI Gateway → default → Logs</strong>. You'll find every call from this lab, including the log IDs above, cache hits and neuron usage. In the gateway's settings you can turn on caching or rate limiting for every request without changing code.</p>
        <a className="docs" href="https://dash.cloudflare.com/?to=/:account/ai/ai-gateway" target="_blank" rel="noreferrer">Open AI Gateway ↗</a>
      </Demo>
      <CodePeek file="worker/routes/ai.ts" source={source} />
    </FeaturePage>
  );
}
