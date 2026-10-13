import { Hono } from "hono";

const images = new Hono<{ Bindings: Env }>();

const FORMATS = { webp: "image/webp", avif: "image/avif", jpeg: "image/jpeg", png: "image/png" } as const;

const getImage = async (env: Env, name: string) => {
  const object = await env.BUCKET.get(`uploads/${name}`);
  if (!object) return { error: "Image not found in R2" as const };
  if (!object.httpMetadata?.contentType?.startsWith("image/")) {
    await object.body.cancel();
    return { error: "That R2 object isn't an image" as const };
  }
  return { object };
};

// Image dimensions and format, read straight from the R2 stream.
images.get("/:name/info", async (c) => {
  const { object, error } = await getImage(c.env, c.req.param("name"));
  if (error) return c.json({ error }, 404);
  return c.json({ ...(await c.env.IMAGES.info(object.body)), storedBytes: object.size });
});

// Transform on the fly: R2 → Images binding → browser. The original file in R2 is never changed.
images.get("/:name", async (c) => {
  const { object, error } = await getImage(c.env, c.req.param("name"));
  if (error) return c.json({ error }, 404);

  const width = Math.min(Math.max(Number(c.req.query("w")) || 400, 32), 1600);
  const rotate = [0, 90, 180, 270].includes(Number(c.req.query("rotate"))) ? Number(c.req.query("rotate")) as 0 | 90 | 180 | 270 : 0;
  const blur = Math.min(Math.max(Number(c.req.query("blur")) || 0, 0), 50);
  const format = FORMATS[(c.req.query("format") ?? "webp") as keyof typeof FORMATS] ?? FORMATS.webp;

  const result = await c.env.IMAGES
    .input(object.body)
    .transform({ width, rotate, ...(blur ? { blur } : {}) })
    .output({ format, quality: 80 });

  return result.response({ headers: { "cache-control": "public, max-age=3600", "x-original-bytes": String(object.size) } });
});

export default images;
