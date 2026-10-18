import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { Turnstile } from "../components/Turnstile";
import source from "../../worker/routes/r2.ts?raw";

type Obj = { key: string; size: number; uploaded: string; contentType?: string; customMetadata?: Record<string, string> };

const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function R2() {
  const [objects, setObjects] = useState<Obj[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [headers, setHeaders] = useState<unknown>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => api<{ objects: Obj[] }>("/r2").then((r) => setObjects(r.objects)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const upload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setError(""); setBusy(true);
    try {
      await api(`/r2/${encodeURIComponent(file.name)}?note=${encodeURIComponent(note)}`, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream", "cf-turnstile-response": token ?? "" },
        body: file,
      });
      fileInput.current!.value = "";
      await refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
    setResetKey((k) => k + 1); // tokens are single-use
  };

  // Fetch with a Range header to prove R2 can serve partial content (status 206).
  const probe = async (key: string) => {
    const url = `/api/r2/${encodeURIComponent(key)}`;
    const head = await fetch(url, { method: "HEAD" });
    const ranged = await fetch(url, { headers: { range: "bytes=0-15" } });
    const etag = head.headers.get("etag");
    const conditional = await fetch(url, { headers: { "if-none-match": etag ?? "" }, cache: "no-store" });
    setHeaders({
      HEAD: { status: head.status, "content-type": head.headers.get("content-type"), "content-length": head.headers.get("content-length"), etag },
      "GET Range: bytes=0-15": { status: ranged.status, "content-range": ranged.headers.get("content-range"), bytesReceived: (await ranged.arrayBuffer()).byteLength },
      "GET If-None-Match: <etag>": { status: conditional.status },
    });
  };

  const remove = async (key: string) => {
    await api(`/r2/${encodeURIComponent(key)}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <FeaturePage
      title="R2"
      tagline="Object storage for files of any size, with no fees for downloading them."
      docs="https://developers.cloudflare.com/r2/"
      whatItIs={<p>
        R2 stores <em>objects</em>: files plus HTTP metadata (content type, cache headers) and your
        own <strong>custom metadata</strong>. Use it from a Worker through a binding, or from any
        S3 tool or SDK with the S3-compatible API. A bucket can also be made public, with a
        custom domain. <strong>Egress is free</strong>, so serving files costs nothing extra.
        Free plan: 10 GB storage, 1M writes and 10M reads per month.
      </p>}
      whenToUse={[
        "User uploads, images, video, backups",
        "Static asset hosting and large downloads",
        "Data lakes. R2 also offers Iceberg tables via R2 Data Catalog.",
      ]}
    >
      {error && <p className="error">{error}</p>}

      <Demo title="Upload a file (max 10 MB)">
        <Turnstile action="upload" onToken={setToken} resetKey={resetKey} />
        <p>The browser PUTs the raw file to the Worker, which streams it straight into <code>BUCKET.put()</code> without buffering it.</p>
        <div className="form-row">
          <input type="file" ref={fileInput} aria-label="File to upload" />
          <label className="grow">Custom metadata: note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></label>
          <button onClick={upload} disabled={busy || !token}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
      </Demo>

      <Demo title={`Objects in bucket (${objects.length})`}>
        <table className="table">
          <thead><tr><th>Key</th><th>Size</th><th>Type</th><th>Custom metadata</th><th /></tr></thead>
          <tbody>
            {objects.map((o) => (
              <tr key={o.key}>
                <td><a href={`/api/r2/${encodeURIComponent(o.key)}`} target="_blank" rel="noreferrer">{o.key}</a></td>
                <td>{formatBytes(o.size)}</td>
                <td className="muted small">{o.contentType}</td>
                <td className="muted small">{JSON.stringify(o.customMetadata)}</td>
                <td className="actions">
                  <button className="ghost" onClick={() => probe(o.key)}>HTTP tricks</button>
                  <button className="ghost" onClick={() => remove(o.key)}>Delete</button>
                </td>
              </tr>
            ))}
            {objects.length === 0 && <tr><td colSpan={5} className="muted">Bucket is empty. Upload something.</td></tr>}
          </tbody>
        </table>
        {headers != null && <>
          <p className="small">R2 handles HEAD (metadata only), Range requests (206 Partial Content), and ETag checks (304 Not Modified):</p>
          <JsonView value={headers} />
        </>}
      </Demo>

      <CodePeek file="worker/routes/r2.ts" source={source} />
    </FeaturePage>
  );
}
