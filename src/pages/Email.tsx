import { Fragment, useEffect, useState } from "react";
import { adminHeaders } from "../adminToken";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage } from "../components/FeatureCard";
import source from "../../worker/email.ts?raw";

type Stats = { address: string; total: number; lastReceived: string | null };
type Message = { id: number; from_addr: string; from_name: string | null; subject: string | null; text_preview: string | null; attachments: number; raw_size: number; forwarded: number; replied: number; received_at: string };

export function Email() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const loadStats = () => fetch("/api/email/stats").then((r) => r.json()).then(setStats).catch(() => {});
  const loadInbox = async () => {
    setInboxError("");
    // Works with an Access login (admin.djmiskey.com) or the admin token from the Security page.
    const res = await fetch("/api/email/messages", { headers: adminHeaders() });
    if (res.ok) setMessages((await res.json()).messages);
    else { setMessages(null); setInboxError(res.status === 401 ? "The inbox is private. Open admin.djmiskey.com/email (Access login) or enter the admin token on the Security page." : `HTTP ${res.status}`); }
  };
  useEffect(() => { loadStats(); loadInbox(); }, []);

  const remove = async (id: number) => {
    await fetch(`/api/email/messages/${id}`, { method: "DELETE", headers: adminHeaders() });
    loadInbox(); loadStats();
  };

  return (
    <FeaturePage
      title="Email Workers"
      tagline="Receive email in code: route an address on your domain to a Worker and do anything with each message."
      docs="https://developers.cloudflare.com/email-routing/email-workers/"
      whatItIs={<p>
        <strong>Email Routing</strong> gives your domain free email addresses with no mail server. Instead of forwarding
        an address to an inbox, you can route it to a Worker's <code>email()</code> handler, a third kind of event next to
        <code> fetch</code> and <code>scheduled</code>. The Worker gets the raw message and can parse it, store it,
        <code> forward()</code> it to a verified address, <code>reply()</code>, or <code>setReject()</code> it.
      </p>}
      whenToUse={[
        "Support inboxes that create tickets, or parse orders and receipts",
        "Email-to-API bridges: alerts, form submissions, \"reply to comment\"",
        "Filtering, auto-replies and routing rules written in code",
      ]}
    >
      <Demo title="1. Send it an email">
        <p>
          Write to <strong><a href={`mailto:${stats?.address ?? "lab@djmiskey.com"}`}>{stats?.address ?? "lab@djmiskey.com"}</a></strong> from
          any mail account. Within seconds the Worker parses it with <code>postal-mime</code>, saves it in D1, forwards a
          copy to the lab's owner and sends you an automatic reply. (No reply goes to automated mail, to avoid loops.)
        </p>
        <p className="small">
          Received so far: <strong>{stats?.total ?? "…"}</strong>
          {stats?.lastReceived ? <> · last one {new Date(stats.lastReceived).toLocaleString()}</> : null}
          {" "}<button className="ghost" onClick={() => { loadStats(); loadInbox(); }}>Refresh</button>
        </p>
      </Demo>

      <Demo title="2. The inbox (admin only)">
        {inboxError && <p className="small muted">{inboxError}</p>}
        {messages && messages.length === 0 && <p className="muted small">No messages yet.</p>}
        {messages && messages.length > 0 && (
          <table className="table">
            <thead><tr><th>Received</th><th>From</th><th>Subject</th><th>Size</th><th>Forwarded / replied</th><th /></tr></thead>
            <tbody>{messages.map((m) => (
              <Fragment key={m.id}>
                <tr onClick={() => setOpen(open === m.id ? null : m.id)} style={{ cursor: "pointer" }}>
                  <td className="small">{new Date(m.received_at).toLocaleString()}</td>
                  <td className="small">{m.from_name ? `${m.from_name} ` : ""}<span className="muted">&lt;{m.from_addr}&gt;</span></td>
                  <td>{m.subject}{m.attachments ? ` 📎${m.attachments}` : ""}</td>
                  <td className="small muted">{(m.raw_size / 1024).toFixed(1)} KB</td>
                  <td className="small">{m.forwarded ? "✅" : "—"} / {m.replied ? "✅" : "—"}</td>
                  <td className="actions"><button className="ghost" onClick={(e) => { e.stopPropagation(); remove(m.id); }}>Delete</button></td>
                </tr>
                {open === m.id && <tr><td colSpan={6}><pre className="code">{m.text_preview || "(no plain-text body)"}</pre></td></tr>}
              </Fragment>
            ))}</tbody>
          </table>
        )}
      </Demo>

      <Demo title="How it's wired">
        <ol className="small">
          <li><strong>Email Routing</strong> is enabled on djmiskey.com. Cloudflare adds the MX and SPF records, so mail for the domain arrives at Cloudflare.</li>
          <li>A routing rule sends <code>lab@djmiskey.com</code> to the <strong>cf-feature-lab</strong> Worker.</li>
          <li>The Worker's <code>email(message, env)</code> handler runs: parse → D1 → <code>forward()</code> → <code>reply()</code>.</li>
          <li>Forwarding only works to <strong>verified destination addresses</strong>. Replies go only to the sender.</li>
        </ol>
      </Demo>

      <CodePeek file="worker/email.ts" source={source} />
    </FeaturePage>
  );
}
