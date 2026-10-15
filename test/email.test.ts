import { adminSecretsStore, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { isAutomated } from "../worker/email";
import worker from "../worker/index";
import { call } from "./helpers";

// A fake ForwardableEmailMessage: a real RFC 822 message as a stream, with
// forward/reply/setReject recorded instead of sending anything.
function fakeMessage(raw: string, from = "alice@example.com", to = "lab@djmiskey.com") {
  const bytes = new TextEncoder().encode(raw.replace(/\n/g, "\r\n"));
  const headerBlock = raw.split("\n\n")[0];
  const headers = new Headers(headerBlock.split("\n").filter((l) => l.includes(":")).map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()] as [string, string]));
  return {
    from, to, headers, rawSize: bytes.byteLength,
    raw: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }),
    forward: vi.fn(async () => ({ messageId: "fwd" })),
    reply: vi.fn(async () => ({ messageId: "reply" })),
    setReject: vi.fn(),
  };
}

const hello = `From: Alice <alice@example.com>
To: lab@djmiskey.com
Subject: Hello lab
Message-ID: <abc123@example.com>
Content-Type: text/plain; charset=utf-8

Hi! Does this reach a Worker?`;

const withAttachment = `From: Bob <bob@example.com>
To: lab@djmiskey.com
Subject: Report
Content-Type: multipart/mixed; boundary="b1"

--b1
Content-Type: text/plain

See attached.
--b1
Content-Type: text/plain; name="notes.txt"
Content-Disposition: attachment; filename="notes.txt"

attachment body
--b1--`;

const deliver = (m: ReturnType<typeof fakeMessage>) => worker.email(m as unknown as ForwardableEmailMessage, env);

describe("Email Workers", () => {
  it("stores, forwards and auto-replies to a normal message", async () => {
    const m = fakeMessage(hello);
    await deliver(m);

    const row = await env.DB.prepare("SELECT * FROM emails ORDER BY id DESC LIMIT 1").first<Record<string, unknown>>();
    expect(row).toMatchObject({ from_addr: "alice@example.com", from_name: "Alice", subject: "Hello lab", forwarded: 1, replied: 1, attachments: 0 });
    expect(row?.text_preview).toContain("Does this reach a Worker?");

    expect(m.forward).toHaveBeenCalledWith("damian.miskey@yahoo.com", expect.any(Headers));
    expect(m.reply).toHaveBeenCalledWith(expect.objectContaining({ from: "lab@djmiskey.com", subject: "Re: Hello lab", headers: { "Auto-Submitted": "auto-replied" } }));
    expect(m.setReject).not.toHaveBeenCalled();
  });

  it("counts attachments", async () => {
    await deliver(fakeMessage(withAttachment, "bob@example.com"));
    expect(await env.DB.prepare("SELECT attachments, text_preview FROM emails ORDER BY id DESC LIMIT 1").first()).toMatchObject({ attachments: 1, text_preview: expect.stringContaining("See attached.") });
  });

  it("never auto-replies to automated mail (no reply loops)", async () => {
    const m = fakeMessage(hello.replace("Subject: Hello lab", "Subject: Out of office\nAuto-Submitted: auto-replied"));
    await deliver(m);
    expect(m.reply).not.toHaveBeenCalled();
    expect(m.forward).toHaveBeenCalled(); // still stored and forwarded
  });

  it("detects the standard robot signals", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(isAutomated(h({ "auto-submitted": "auto-generated" }), "a@x.com")).toBe(true);
    expect(isAutomated(h({ "auto-submitted": "no" }), "a@x.com")).toBe(false);
    expect(isAutomated(h({ precedence: "bulk" }), "a@x.com")).toBe(true);
    expect(isAutomated(h({ "list-id": "<news.example.com>" }), "a@x.com")).toBe(true);
    expect(isAutomated(h({}), "noreply@service.com")).toBe(true);
    expect(isAutomated(h({}), "MAILER-DAEMON@mx.example.com")).toBe(true);
    expect(isAutomated(h({}), "alice@example.com")).toBe(false);
  });

  it("rejects mail for any other address", async () => {
    // Storage is shared by the tests in this file, so compare before and after.
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM emails").first("n");
    const m = fakeMessage(hello, "alice@example.com", "someone-else@djmiskey.com");
    await deliver(m);
    expect(m.setReject).toHaveBeenCalledWith("Unknown recipient");
    expect(m.forward).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM emails").first("n")).toBe(before);
  });

  it("keeps the inbox private but the count public", async () => {
    const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM emails").first<number>("n"))!;
    expect(await (await call("/email/stats")).json()).toMatchObject({ address: "lab@djmiskey.com", total, lastReceived: expect.any(String) });
    expect((await call("/email/messages")).status).toBe(401);

    await adminSecretsStore(env.ADMIN_TOKEN).create("test-admin-token-1234567890");
    const res = await call("/email/messages", { headers: { authorization: "Bearer test-admin-token-1234567890" } });
    expect(res.status).toBe(200);
    expect((await res.json<{ messages: unknown[] }>()).messages).toHaveLength(total);
  });
});
