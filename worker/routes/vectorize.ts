import { Hono } from "hono";
import { GATEWAY_ID, MODELS } from "../ai-models";

const vectorize = new Hono<{ Bindings: Env }>();

type Note = { id: number; author: string; body: string; tag: string };

// `wrangler types` types the binding as the legacy V1 `VectorizeIndex`.
// Indexes created today are V2, whose API is typed `Vectorize`.
const index = (env: Env) => env.VECTORIZE as unknown as Vectorize;

const embed = async (env: Env, texts: string[]) =>
  ((await env.AI.run(MODELS.embedding, { text: texts })) as { data: number[][] }).data;

// Semantic search: embed the question, then ask Vectorize for the nearest
// vectors. Vectorize stores only vectors + metadata, so the full rows come
// from D1 using the matched IDs.
async function search(env: Env, query: string, tag?: string, topK = 5) {
  const [vector] = await embed(env, [query]);
  const { matches } = await index(env).query(vector, {
    topK,
    returnMetadata: "all",
    // Metadata filters need a metadata index on that property (we created one for `tag`).
    ...(tag ? { filter: { tag } } : {}),
  });
  if (!matches.length) return [];

  const ids = matches.map((m) => Number(m.metadata?.noteId));
  const { results } = await env.DB
    .prepare(`SELECT id, author, body, tag FROM notes WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<Note>();
  const byId = new Map(results.map((n) => [n.id, n]));

  return matches
    .map((m) => ({ score: Number(m.score.toFixed(4)), note: byId.get(Number(m.metadata?.noteId)) }))
    // A vector can outlive its note if the row was deleted in D1 after syncing.
    .filter((m): m is { score: number; note: Note } => Boolean(m.note));
}

vectorize.get("/info", async (c) => c.json(await index(c.env).describe()));

// Embed every D1 note and upsert it. Upsert replaces a vector with the same
// ID, so syncing again is safe. Writes are asynchronous: new vectors become
// searchable a few seconds after the mutation is accepted.
vectorize.post("/sync", async (c) => {
  const { results: notes } = await c.env.DB.prepare("SELECT id, author, body, tag FROM notes ORDER BY id LIMIT 500").all<Note>();
  if (!notes.length) return c.json({ synced: 0 });

  let mutationId = "";
  for (let i = 0; i < notes.length; i += 50) {
    const batch = notes.slice(i, i + 50);
    const vectors = await embed(c.env, batch.map((n) => n.body));
    const res = await index(c.env).upsert(batch.map((n, j) => ({
      id: `note-${n.id}`,
      values: vectors[j],
      metadata: { noteId: n.id, tag: n.tag },
    })));
    mutationId = res.mutationId;
  }
  return c.json({ synced: notes.length, mutationId });
});

vectorize.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: "q is required" }, 400);
  return c.json({ query: q, matches: await search(c.env, q.slice(0, 300), c.req.query("tag") || undefined) });
});

// RAG (retrieval-augmented generation): find the most relevant notes, then
// give them to the model as context so it answers from your data.
vectorize.post("/ask", async (c) => {
  const { question } = await c.req.json<{ question: string }>();
  if (!question?.trim()) return c.json({ error: "question is required" }, 400);

  const sources = await search(c.env, question.slice(0, 300), undefined, 3);
  const context = sources.map((s, i) => `[${i + 1}] ${s.note.body}`).join("\n");
  const { response } = (await c.env.AI.run(
    MODELS.text,
    {
      messages: [
        {
          role: "system",
          content: "You answer questions using a set of notes. Reply in one to three full sentences, " +
            "then cite the notes you used in square brackets, e.g. \"...in V8 isolates [1].\" " +
            "If the notes don't contain the answer, say you don't know.",
        },
        { role: "user", content: `Notes:\n${context || "(no notes found)"}\n\nQuestion: ${question.slice(0, 500)}` },
      ],
      max_tokens: 300,
    },
    { gateway: { id: GATEWAY_ID } },
  )) as { response?: string };

  return c.json({ answer: response, sources });
});

export default vectorize;
