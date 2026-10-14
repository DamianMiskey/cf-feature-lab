import { Hono } from "hono";
import { requireTurnstile } from "../turnstile";

const d1 = new Hono<{ Bindings: Env }>();

type Note = { id: number; author: string; body: string; tag: string; created_at: string };

// Every D1 result carries `meta`: rows read/written and query duration.
// The UI shows it so you can see what each query costs.
d1.get("/notes", async (c) => {
  const tag = c.req.query("tag");
  // Always bind values with `?` placeholders. Never build SQL strings by hand.
  const stmt = tag
    ? c.env.DB.prepare("SELECT * FROM notes WHERE tag = ? ORDER BY id DESC LIMIT 50").bind(tag)
    : c.env.DB.prepare("SELECT * FROM notes ORDER BY id DESC LIMIT 50");
  const { results, meta } = await stmt.all<Note>();
  return c.json({ notes: results, meta });
});

// Public write: needs a Turnstile token so bots can't fill the table.
d1.post("/notes", requireTurnstile("add-note"), async (c) => {
  const { author, body, tag } = await c.req.json<Partial<Note>>();
  if (!author?.trim() || !body?.trim()) return c.json({ error: "author and body are required" }, 400);

  // RETURNING gives back the inserted row in the same round trip.
  const note = await c.env.DB
    .prepare("INSERT INTO notes (author, body, tag) VALUES (?, ?, ?) RETURNING *")
    .bind(author.trim().slice(0, 60), body.trim().slice(0, 500), (tag?.trim() || "general").slice(0, 30))
    .first<Note>();
  return c.json({ note }, 201);
});

d1.delete("/notes/:id", async (c) => {
  const { meta } = await c.env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(Number(c.req.param("id"))).run();
  if (meta.changes === 0) return c.json({ error: "Note not found" }, 404);
  return c.json({ ok: true, meta });
});

// batch() sends several statements in one round trip and runs them as a
// transaction: if any statement fails, none of them are applied.
d1.post("/batch", async (c) => {
  const insert = c.env.DB.prepare("INSERT INTO notes (author, body, tag) VALUES (?, ?, 'batch')");
  const results = await c.env.DB.batch([
    insert.bind("Batch bot", "First of three rows inserted in one transaction."),
    insert.bind("Batch bot", "Second row. Same round trip."),
    insert.bind("Batch bot", "Third row. All-or-nothing."),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM notes"),
  ]);
  return c.json({ results: results.map((r) => ({ results: r.results, meta: r.meta })) });
});

// The same, but the last statement is invalid, so the whole batch rolls back.
d1.post("/batch-fail", async (c) => {
  const before = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM notes").first<number>("total");
  let error = "";
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO notes (author, body) VALUES ('Rollback', 'You will never see me.')"),
      c.env.DB.prepare("INSERT INTO missing_table VALUES (1)"),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }
  const after = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM notes").first<number>("total");
  return c.json({ before, after, rolledBack: before === after, error });
});

// Aggregates: ordinary SQLite SQL.
d1.get("/stats", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT tag, COUNT(*) AS count, MAX(created_at) AS latest FROM notes GROUP BY tag ORDER BY count DESC")
    .all();
  return c.json({ byTag: results });
});

export default d1;
