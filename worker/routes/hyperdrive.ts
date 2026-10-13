import { Hono } from "hono";

const hyperdrive = new Hono<{ Bindings: Env }>();

type Product = { id: number; name: string; price: string; created_at: string };

// Workers handle each request in isolation, so open a client per request and
// close it afterwards. With Hyperdrive that's cheap: Hyperdrive keeps the real
// connections to Neon warm in a pool near the database, so `connect()` only
// talks to Cloudflare's nearby edge.
async function query<T>(connectionString: string, sql: string, params: unknown[] = []) {
  const started = Date.now();
  // Load the driver only when a query runs. Other routes skip the cost, and
  // the test runner (which can't load pg's CommonJS) never imports it.
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  const connectMs = Date.now() - started;
  try {
    const result = await client.query(sql, params);
    return { rows: result.rows as T[], connectMs, totalMs: Date.now() - started };
  } finally {
    // Closing doesn't need to block the response.
    client.end().catch(() => {});
  }
}

const viaHyperdrive = <T>(env: Env, sql: string, params?: unknown[]) => query<T>(env.HYPERDRIVE.connectionString, sql, params);

const SETUP = `
  CREATE TABLE IF NOT EXISTS lab_products (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    price      NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO lab_products (name, price)
  SELECT * FROM (VALUES ('Edge Widget', 9.99), ('Durable Gadget', 24.50), ('Vector Gizmo', 15.00)) AS seed(name, price)
  WHERE NOT EXISTS (SELECT 1 FROM lab_products);`;

// The table is created and seeded the first time it's missing.
async function listProducts(env: Env) {
  const sql = "SELECT id, name, price, created_at FROM lab_products ORDER BY id LIMIT 50";
  try {
    return await viaHyperdrive<Product>(env, sql);
  } catch (e) {
    if ((e as { code?: string }).code !== "42P01") throw e; // 42P01 = undefined_table
    await viaHyperdrive(env, SETUP);
    return viaHyperdrive<Product>(env, sql);
  }
}

hyperdrive.get("/products", async (c) => {
  const { rows, connectMs, totalMs } = await listProducts(c.env);
  return c.json({ products: rows, connectMs, totalMs });
});

hyperdrive.post("/products", async (c) => {
  const { name, price } = await c.req.json<{ name?: string; price?: number }>();
  if (!name?.trim() || !(Number(price) >= 0)) return c.json({ error: "name and a non-negative price are required" }, 400);
  // Parameterised query ($1, $2): never interpolate user input into SQL.
  const { rows } = await viaHyperdrive<Product>(
    c.env,
    "INSERT INTO lab_products (name, price) VALUES ($1, $2) RETURNING id, name, price, created_at",
    [name.trim().slice(0, 60), Number(price)],
  );
  return c.json({ product: rows[0] }, 201);
});

hyperdrive.delete("/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  await viaHyperdrive(c.env, "DELETE FROM lab_products WHERE id = $1", [id]);
  return c.json({ ok: true });
});

// The point of Hyperdrive, measured: run the same read 3 times through
// Hyperdrive and 3 times straight to Neon, with a fresh connection each time,
// as a Worker would per request.
//  - Direct: every run pays for a TCP + TLS + Postgres auth handshake with
//    Neon's region, from wherever this Worker is running.
//  - Hyperdrive: connect to the nearby edge, reuse a pooled connection, and
//    repeat reads can come from Hyperdrive's query cache (default 60 s).
hyperdrive.get("/compare", async (c) => {
  await listProducts(c.env); // make sure the table exists
  const sql = "SELECT count(*)::int AS products, max(price) AS top_price FROM lab_products";
  const runs = async (cs: string) => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const { connectMs, totalMs } = await query(cs, sql);
      out.push({ connectMs, totalMs });
    }
    return out;
  };
  return c.json({
    hyperdrive: await runs(c.env.HYPERDRIVE.connectionString),
    direct: c.env.NEON_DATABASE_URL ? await runs(c.env.NEON_DATABASE_URL) : null,
    colo: c.req.raw.cf?.colo ?? "local",
  });
});

// Server facts. now() is volatile, so Hyperdrive never caches this query.
hyperdrive.get("/info", async (c) => {
  const { rows, totalMs } = await viaHyperdrive<{ version: string; database: string; now: string }>(
    c.env,
    "SELECT split_part(version(), ' on ', 1) AS version, current_database() AS database, now() AS now",
  );
  return c.json({ ...rows[0], totalMs, hyperdriveHost: c.env.HYPERDRIVE.host });
});

export default hyperdrive;
