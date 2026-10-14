import { Hono } from "hono";

const r2 = new Hono<{ Bindings: Env }>();

// Workers accept request bodies up to 100 MB on the free plan. The demo caps uploads lower.
const MAX_UPLOAD = 10 * 1024 * 1024;

// Only accept types the lab knows how to handle safely. SVG is deliberately
// missing: it can contain scripts, and served from this origin it would be a
// stored-XSS hole.
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
  "text/plain", "application/pdf", "application/json",
]);
// These can be shown in the browser. Everything else downloads as a file.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"]);
const PREFIX = "uploads/";

// List objects. R2 list() returns size, etag and upload time. With include,
// it also returns the HTTP and custom metadata stored with each object.
r2.get("/", async (c) => {
  const listed = await c.env.BUCKET.list({
    prefix: PREFIX,
    limit: 100,
    include: ["httpMetadata", "customMetadata"],
  });
  return c.json({
    objects: listed.objects.map((o) => ({
      key: o.key.slice(PREFIX.length),
      size: o.size,
      etag: o.etag,
      uploaded: o.uploaded,
      contentType: o.httpMetadata?.contentType,
      customMetadata: o.customMetadata,
    })),
    truncated: listed.truncated,
  });
});

// Upload: the request body streams straight into R2 without being buffered in
// the Worker's memory.
r2.put("/:name", async (c) => {
  const size = Number(c.req.header("content-length") ?? 0);
  if (!size) return c.json({ error: "Empty upload or missing Content-Length" }, 400);
  if (size > MAX_UPLOAD) return c.json({ error: "Demo uploads are limited to 10 MB" }, 413);

  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    return c.json({ error: `File type "${contentType || "unknown"}" isn't allowed. Allowed: ${[...ALLOWED_TYPES].join(", ")}` }, 415);
  }

  const name = c.req.param("name").replace(/[^\w.\-]/g, "_");
  const object = await c.env.BUCKET.put(PREFIX + name, c.req.raw.body, {
    httpMetadata: { contentType },
    customMetadata: { uploadedFrom: c.req.raw.cf?.colo as string ?? "local", note: c.req.query("note") ?? "" },
  });
  return c.json({ key: name, size: object?.size, etag: object?.etag }, 201);
});

// Download: stream the object back with its stored headers. Passing the
// request headers lets R2 handle Range (partial downloads) and
// If-None-Match (304 Not Modified) for you.
r2.get("/:name", async (c) => {
  const object = await c.env.BUCKET.get(PREFIX + c.req.param("name"), {
    range: c.req.raw.headers,
    onlyIf: c.req.raw.headers,
  });
  if (object === null) return c.json({ error: "Object not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=60");
  // Anything that isn't a known-safe viewable type downloads instead of rendering.
  if (!INLINE_TYPES.has(headers.get("content-type") ?? "")) {
    headers.set("content-disposition", `attachment; filename="${c.req.param("name").replace(/"/g, "")}"`);
  }

  // When an onlyIf precondition fails, R2 returns metadata but no body.
  if (!("body" in object)) return new Response(null, { status: 304, headers });

  if (object.range && "offset" in object.range) {
    const { offset = 0, length = object.size - offset } = object.range;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
});

// head() fetches metadata only. That's cheap, and it never downloads the body.
r2.on("HEAD", "/:name", async (c) => {
  const object = await c.env.BUCKET.head(PREFIX + c.req.param("name"));
  if (!object) return c.body(null, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-length", String(object.size));
  return new Response(null, { headers });
});

r2.delete("/:name", async (c) => {
  await c.env.BUCKET.delete(PREFIX + c.req.param("name"));
  return c.json({ ok: true });
});

export default r2;
