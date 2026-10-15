import PostalMime from "postal-mime";

// Email Workers: Cloudflare Email Routing hands each message sent to
// lab@djmiskey.com to the Worker's email() handler. Here we parse it, keep a
// copy in D1, forward it to a verified address and send a polite auto-reply.
// This is a third kind of event, next to fetch (HTTP) and scheduled (Cron).

// Automated mail must never get an auto-reply, or two robots can reply to
// each other forever. These are the standard signals (RFC 3834).
export function isAutomated(headers: Headers, from: string) {
  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  if (/^(bulk|list|junk)$/i.test(headers.get("precedence") ?? "")) return true;
  if (headers.has("list-id") || headers.has("list-unsubscribe")) return true;
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i.test(from);
}

export async function handleEmail(message: ForwardableEmailMessage, env: Env) {
  // Only accept mail for our own address (useful if a catch-all rule sends more).
  if (message.to.toLowerCase() !== env.EMAIL_ADDRESS.toLowerCase()) {
    message.setReject("Unknown recipient");
    return;
  }

  const parsed = await PostalMime.parse(message.raw);
  const subject = (parsed.subject ?? "(no subject)").slice(0, 300);

  const row = await env.DB
    .prepare(`INSERT INTO emails (message_id, from_addr, from_name, to_addr, subject, text_preview, attachments, raw_size)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(
      parsed.messageId ?? null,
      message.from,
      parsed.from && "address" in parsed.from ? parsed.from.name || null : null,
      message.to,
      subject,
      (parsed.text ?? "").slice(0, 2000),
      parsed.attachments.length,
      message.rawSize,
    )
    .first<{ id: number }>();

  // Forward a copy. The destination must be verified in Email Routing first.
  let forwarded = false;
  if (env.EMAIL_FORWARD_TO) {
    try {
      await message.forward(env.EMAIL_FORWARD_TO, new Headers({ "X-Lab-Email-Id": String(row?.id ?? "") }));
      forwarded = true;
    } catch (e) {
      console.error("forward failed", e);
    }
  }

  // Auto-reply to people, never to robots.
  let replied = false;
  if (!isAutomated(message.headers, message.from)) {
    try {
      await message.reply({
        from: env.EMAIL_ADDRESS,
        subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        headers: { "Auto-Submitted": "auto-replied" },
        text:
          "Thanks! Your message reached the Cloudflare Feature Lab.\n\n" +
          "It was received by an Email Worker, stored in a D1 database and forwarded to its owner. " +
          "This reply was sent automatically.\n\n" +
          "See how it works: https://lab.djmiskey.com/email",
      });
      replied = true;
    } catch (e) {
      console.error("reply failed", e);
    }
  }

  if (row) {
    await env.DB.prepare("UPDATE emails SET forwarded = ?, replied = ? WHERE id = ?").bind(Number(forwarded), Number(replied), row.id).run();
  }
  console.log({ event: "email.received", id: row?.id, forwarded, replied, size: message.rawSize });
}
