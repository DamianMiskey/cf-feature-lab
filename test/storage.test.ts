import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, json } from "./helpers";

describe("KV", () => {
  it("writes, reads, lists and deletes a key with metadata", async () => {
    expect((await call("/kv/greeting", json("PUT", { value: "hi", ttl: 120, metadata: { a: 1 } }))).status).toBe(200);

    const read = await (await call("/kv/greeting")).json<{ value: string; metadata: Record<string, unknown> }>();
    expect(read.value).toBe("hi");
    expect(read.metadata).toMatchObject({ a: 1, writtenAt: expect.any(String) });

    const list = await (await call("/kv")).json<{ keys: { name: string; expiration?: number }[] }>();
    expect(list.keys).toEqual([expect.objectContaining({ name: "greeting", expiration: expect.any(Number) })]);

    // The prefix keeps demo keys namespaced in the real store.
    expect(await env.KV.get("lab:greeting")).toBe("hi");

    await call("/kv/greeting", { method: "DELETE" });
    expect((await call("/kv/greeting")).status).toBe(404);
  });

  it("rejects TTLs under KV's 60-second minimum", async () => {
    const res = await call("/kv/short", json("PUT", { value: "x", ttl: 5 }));
    expect(res.status).toBe(400);
  });
});

describe("D1", () => {
  it("starts with the seeded notes from the migration", async () => {
    const { notes } = await (await call("/d1/notes")).json<{ notes: unknown[] }>();
    expect(notes).toHaveLength(4);
  });

  it("inserts, filters by tag and deletes", async () => {
    const created = await call("/d1/notes", json("POST", { author: "Test", body: "hello", tag: "testing" }));
    expect(created.status).toBe(201);
    const { note } = await created.json<{ note: { id: number } }>();

    const { notes } = await (await call("/d1/notes?tag=testing")).json<{ notes: { body: string }[] }>();
    expect(notes.map((n) => n.body)).toEqual(["hello"]);

    expect((await call(`/d1/notes/${note.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await call(`/d1/notes/${note.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("validates input", async () => {
    expect((await call("/d1/notes", json("POST", { author: "", body: "x" }))).status).toBe(400);
  });

  it("applies a batch as one transaction and rolls back a failing one", async () => {
    await call("/d1/batch", { method: "POST" });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM notes").first("n")).toBe(7);

    const failed = await (await call("/d1/batch-fail", { method: "POST" })).json<{ rolledBack: boolean; before: number; after: number }>();
    expect(failed).toMatchObject({ rolledBack: true, before: 7, after: 7 });
  });
});

describe("R2", () => {
  const text = "Hello R2! This body is longer than sixteen bytes.";

  it("uploads, lists, downloads with Range and ETags, then deletes", async () => {
    const put = await call("/r2/hello world.txt?note=test", { method: "PUT", body: text, headers: { "content-type": "text/plain" } });
    expect(put.status).toBe(201);
    expect(await put.json()).toMatchObject({ key: "hello_world.txt", size: text.length });

    const { objects } = await (await call("/r2")).json<{ objects: { key: string; customMetadata: Record<string, string> }[] }>();
    expect(objects[0]).toMatchObject({ key: "hello_world.txt", customMetadata: { note: "test" } });

    const full = await call("/r2/hello_world.txt");
    expect(await full.text()).toBe(text);
    const etag = full.headers.get("etag")!;

    const partial = await call("/r2/hello_world.txt", { headers: { range: "bytes=0-4" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 0-4/${text.length}`);
    expect(await partial.text()).toBe("Hello");

    const notModified = await call("/r2/hello_world.txt", { headers: { "if-none-match": etag } });
    expect(notModified.status).toBe(304);

    await call("/r2/hello_world.txt", { method: "DELETE" });
    expect((await call("/r2/hello_world.txt")).status).toBe(404);
  });

  it("rejects empty uploads", async () => {
    expect((await call("/r2/empty.txt", { method: "PUT", body: "" })).status).toBe(400);
  });
});
