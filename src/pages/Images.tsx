import { useEffect, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Link } from "../router";
import source from "../../worker/routes/images.ts?raw";

type Obj = { key: string; size: number; contentType?: string };

export function Images() {
  const [images, setImages] = useState<Obj[]>([]);
  const [name, setName] = useState("");
  const [width, setWidth] = useState(400);
  const [format, setFormat] = useState("webp");
  const [rotate, setRotate] = useState(0);
  const [blur, setBlur] = useState(0);
  const [info, setInfo] = useState<unknown>(null);
  const [outBytes, setOutBytes] = useState<number | null>(null);

  useEffect(() => {
    api<{ objects: Obj[] }>("/r2").then((r) => {
      const imgs = r.objects.filter((o) => o.contentType?.startsWith("image/"));
      setImages(imgs);
      if (imgs[0]) setName(imgs[0].key);
    });
  }, []);

  const src = name ? `/api/images/${encodeURIComponent(name)}?w=${width}&format=${format}&rotate=${rotate}&blur=${blur}` : "";

  // Measure the transformed size so you can compare it with the original.
  useEffect(() => {
    if (!src) return;
    setOutBytes(null);
    fetch(src).then((r) => r.blob()).then((b) => setOutBytes(b.size)).catch(() => {});
    api(`/images/${encodeURIComponent(name)}/info`).then(setInfo).catch(() => {});
  }, [src]);

  const original = images.find((i) => i.key === name)?.size;

  return (
    <FeaturePage
      title="Images"
      tagline="Resize, convert and transform images inside a Worker, straight from R2."
      docs="https://developers.cloudflare.com/images/transform-images/bindings/"
      whatItIs={<p>
        The Images binding takes a stream (here, an R2 object), applies transformations (<code>width</code>,
        <code> rotate</code>, <code>blur</code>, crops, overlays) and outputs WebP, AVIF, JPEG or PNG.
        The original stays untouched in R2. Every size you need is generated on demand, then cached.
        Free plan: 5,000 unique transformations per month.
      </p>}
      whenToUse={[
        "Responsive images: one upload, many sizes",
        "Converting to modern formats (AVIF/WebP) to cut page weight",
        "Thumbnails, watermarks and avatars",
      ]}
    >
      {images.length === 0 ? (
        <Demo title="Upload an image first">
          <p>No images in R2 yet. Upload a JPEG or PNG on the <Link to="/r2">R2 page</Link>, then come back.</p>
        </Demo>
      ) : (
        <Demo title="Transform an R2 image live">
          <div className="form-row">
            <label>Image<select value={name} onChange={(e) => setName(e.target.value)}>{images.map((i) => <option key={i.key}>{i.key}</option>)}</select></label>
            <label>Width: {width}px<input type="range" min={64} max={1200} step={16} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
            <label>Format<select value={format} onChange={(e) => setFormat(e.target.value)}>{["webp", "avif", "jpeg", "png"].map((f) => <option key={f}>{f}</option>)}</select></label>
            <label>Rotate<select value={rotate} onChange={(e) => setRotate(Number(e.target.value))}>{[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}°</option>)}</select></label>
            <label>Blur: {blur}<input type="range" min={0} max={50} value={blur} onChange={(e) => setBlur(Number(e.target.value))} /></label>
          </div>
          <p className="small">
            Original: <strong>{original ? `${(original / 1024).toFixed(0)} KB` : "…"}</strong> → transformed:{" "}
            <strong>{outBytes != null ? `${(outBytes / 1024).toFixed(1)} KB` : "…"}</strong>
            {original && outBytes ? <span className="muted"> ({Math.round((1 - outBytes / original) * 100)}% smaller)</span> : null}
          </p>
          <img className="transformed" src={src} alt={`${name} transformed`} />
          <p className="small muted">URL: <code>{src}</code></p>
          {info != null && <JsonView value={info} />}
        </Demo>
      )}
      <CodePeek file="worker/routes/images.ts" source={source} />
    </FeaturePage>
  );
}
