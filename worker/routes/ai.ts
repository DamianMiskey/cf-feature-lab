import { Hono } from "hono";
import { GATEWAY_ID, MODELS } from "../ai-models";

const ai = new Hono<{ Bindings: Env }>();

// ── Text generation (streamed) ──────────────────────────────────────────
// With stream: true, AI.run() returns a ReadableStream of server-sent events
// (`data: {"response":"..."}`). The Worker passes it straight to the browser,
// so tokens show up as soon as they're generated.
ai.post("/chat", async (c) => {
  const { prompt, system } = await c.req.json<{ prompt: string; system?: string }>();
  if (!prompt?.trim()) return c.json({ error: "prompt is required" }, 400);

  const stream = await c.env.AI.run(
    MODELS.text,
    {
      messages: [
        { role: "system", content: system || "You are a concise, friendly assistant. Answer in under 150 words." },
        { role: "user", content: prompt.slice(0, 2000) },
      ],
      max_tokens: 400,
      stream: true,
    },
    { gateway: { id: GATEWAY_ID } },
  );

  return new Response(stream as ReadableStream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-model": MODELS.text },
  });
});

// ── AI Gateway caching ──────────────────────────────────────────────────
// The same prompt is sent twice through the gateway with caching turned on.
// The first call runs the model and stores the answer. The second is served
// from the gateway's cache in milliseconds. Repeat the prompt and both are hits.
ai.post("/gateway", async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  const input = { messages: [{ role: "user" as const, content: (prompt || "Name three Cloudflare products.").slice(0, 500) }], max_tokens: 120 };

  const timed = async () => {
    const started = Date.now();
    const out = (await c.env.AI.run(MODELS.text, input, {
      gateway: { id: GATEWAY_ID, cacheTtl: 300, metadata: { demo: "feature-lab" } },
    })) as { response?: string };
    // aiGatewayLogId links this call to its entry in the gateway's logs.
    return { ms: Date.now() - started, logId: c.env.AI.aiGatewayLogId, response: out.response };
  };

  const first = await timed();
  const second = await timed();
  return c.json({ gateway: GATEWAY_ID, first, second });
});

// ── Image classification ────────────────────────────────────────────────
ai.post("/classify", async (c) => {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!bytes.length) return c.json({ error: "Send an image as the request body" }, 400);
  if (bytes.length > 4 * 1024 * 1024) return c.json({ error: "Image must be under 4 MB" }, 413);
  const labels = await c.env.AI.run(MODELS.classify, { image: [...bytes] });
  return c.json({ model: MODELS.classify, labels: labels.slice(0, 5) });
});

// ── Text-to-image ───────────────────────────────────────────────────────
ai.post("/image", async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt?.trim()) return c.json({ error: "prompt is required" }, 400);
  const started = Date.now();
  const { image } = await c.env.AI.run(MODELS.image, { prompt: prompt.slice(0, 500), steps: 4 });
  // flux-1-schnell returns a base64-encoded JPEG.
  return c.json({ model: MODELS.image, ms: Date.now() - started, dataUrl: `data:image/jpeg;base64,${image}` });
});

// ── Embeddings ──────────────────────────────────────────────────────────
// An embedding turns text into a vector of numbers. Texts with similar
// meanings get vectors that point in similar directions.
ai.post("/embed", async (c) => {
  const { a, b } = await c.req.json<{ a: string; b: string }>();
  if (!a?.trim() || !b?.trim()) return c.json({ error: "two texts are required" }, 400);
  const { data } = (await c.env.AI.run(MODELS.embedding, { text: [a.slice(0, 500), b.slice(0, 500)] })) as { data: number[][] };
  return c.json({
    model: MODELS.embedding,
    dimensions: data[0].length,
    preview: data.map((v) => v.slice(0, 6).map((x) => Number(x.toFixed(4)))),
    cosineSimilarity: Number(cosine(data[0], data[1]).toFixed(4)),
  });
});

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export default ai;
