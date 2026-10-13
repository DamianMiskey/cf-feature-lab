import { DurableObject } from "cloudflare:workers";

type Ring = { id: number; scheduled_for: string; fired_at: string; label: string };

// Alarms let an object wake itself up at a set time, even when no request is
// coming in. Each object has at most one pending alarm. alarm() is retried
// automatically if it throws.
export class AlarmClock extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scheduled_for TEXT NOT NULL,
        fired_at TEXT NOT NULL,
        label TEXT NOT NULL
      )
    `);
  }

  async schedule(seconds: number, label: string) {
    const at = Date.now() + seconds * 1000;
    // Overwrites any alarm that's already pending.
    await this.ctx.storage.setAlarm(at);
    this.ctx.storage.kv.put("pending", { at, label });
    return this.status();
  }

  async cancel() {
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.kv.delete("pending");
    return this.status();
  }

  // Called by the runtime when the alarm time is reached.
  async alarm(info?: AlarmInvocationInfo) {
    const pending = this.ctx.storage.kv.get<{ at: number; label: string }>("pending");
    this.ctx.storage.sql.exec(
      "INSERT INTO rings (scheduled_for, fired_at, label) VALUES (?, ?, ?)",
      new Date(pending?.at ?? Date.now()).toISOString(),
      new Date().toISOString(),
      `${pending?.label ?? "alarm"}${info?.retryCount ? ` (retry ${info.retryCount})` : ""}`,
    );
    this.ctx.storage.kv.delete("pending");
  }

  async status() {
    const next = await this.ctx.storage.getAlarm();
    const rings = this.ctx.storage.sql
      .exec<Ring>("SELECT * FROM rings ORDER BY id DESC LIMIT 10")
      .toArray();
    return {
      nextAlarm: next ? new Date(next).toISOString() : null,
      label: this.ctx.storage.kv.get<{ label: string }>("pending")?.label ?? null,
      rings,
    };
  }
}
