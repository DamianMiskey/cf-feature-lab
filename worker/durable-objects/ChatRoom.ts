import { DurableObject } from "cloudflare:workers";

type Message = { id: number; name: string; text: string; at: string };
type Attachment = { name: string };

// A chat room: one instance per room name holds every WebSocket connected to it.
//
// It uses the WebSocket *Hibernation* API (ctx.acceptWebSocket): while the
// room is idle, Cloudflare can evict the object from memory without closing
// the sockets, so you aren't billed for idle time. When a message arrives, the
// object is woken up and webSocketMessage() runs.
export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Each object has its own private SQLite database: ctx.storage.sql.
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);
    // The runtime answers "ping" with "pong" without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const name = (new URL(request.url).searchParams.get("name") || "anonymous").slice(0, 30);

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) is what enables hibernation.
    this.ctx.acceptWebSocket(server);
    // Attachments survive hibernation. Use them for per-connection state.
    server.serializeAttachment({ name } satisfies Attachment);

    server.send(JSON.stringify({ type: "history", messages: this.history() }));
    this.broadcast({ type: "presence", event: "joined", name, online: this.online() });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const { name } = ws.deserializeAttachment() as Attachment;
    const text = String(raw).slice(0, 500).trim();
    if (!text) return;

    const message = this.ctx.storage.sql
      .exec<Message>("INSERT INTO messages (name, text) VALUES (?, ?) RETURNING *", name, text)
      .one();
    // Keep only the latest 100 messages.
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE id <= ?", message.id - 100);

    this.broadcast({ type: "message", message });
  }

  async webSocketClose(ws: WebSocket) {
    const { name } = ws.deserializeAttachment() as Attachment;
    // Complete the closing handshake. Don't echo the client's code back:
    // reserved codes such as 1005 ("no status") make close() throw.
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    this.broadcast({ type: "presence", event: "left", name, online: this.online(ws) }, ws);
  }

  private history(): Message[] {
    return this.ctx.storage.sql
      .exec<Message>("SELECT * FROM (SELECT * FROM messages ORDER BY id DESC LIMIT 50) ORDER BY id")
      .toArray();
  }

  // getWebSockets() returns every socket connected to this object, including
  // ones accepted before it last hibernated. `except` leaves out a socket that's closing.
  private sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except);
  }

  private online(except?: WebSocket) {
    return this.sockets(except).length;
  }

  private broadcast(payload: unknown, except?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets(except)) {
      try { ws.send(data); } catch { /* socket already closing */ }
    }
  }
}
