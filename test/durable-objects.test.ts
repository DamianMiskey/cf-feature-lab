import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AlarmClock } from "../worker/durable-objects/AlarmClock";
import type { Counter } from "../worker/durable-objects/Counter";
import { call } from "./helpers";

describe("Durable Objects", () => {
  it("keeps one counter per name", async () => {
    await call("/do/counter/a/increment", { method: "POST" });
    await call("/do/counter/a/increment", { method: "POST" });
    await call("/do/counter/b/increment", { method: "POST" });
    expect(await (await call("/do/counter/a")).json()).toMatchObject({ name: "a", count: 2 });
    expect(await (await call("/do/counter/b")).json()).toMatchObject({ name: "b", count: 1 });
  });

  it("calls RPC methods directly on a stub", async () => {
    const stub = env.COUNTER.getByName("rpc");
    expect(await stub.increment(5)).toBe(5);
    expect(await stub.increment()).toBe(6);
  });

  it("can inspect an object's storage from inside it", async () => {
    const stub = env.COUNTER.getByName("inspect");
    await stub.increment(3);
    await runInDurableObject(stub, (instance: Counter, state) => {
      expect(state.storage.kv.get("count")).toBe(3);
      expect(instance.get().count).toBe(3);
    });
  });

  it("never loses concurrent increments (unlike KV)", async () => {
    const result = await (await call("/do/race?n=20", { method: "POST" })).json<{ durableObject: number; kv: number }>();
    expect(result.durableObject).toBe(20);
    expect(result.kv).toBeLessThan(20);
  });

  it("fires alarms and records each ring", async () => {
    const stub = env.ALARM_CLOCK.getByName("test");
    await stub.schedule(3600, "far future");
    expect((await stub.status()).nextAlarm).not.toBeNull();

    // Run the alarm now instead of waiting an hour.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const status = await runInDurableObject(stub, (instance: AlarmClock) => instance.status());
    expect(status.nextAlarm).toBeNull();
    expect(status.rings).toEqual([expect.objectContaining({ label: "far future" })]);
  });

  it("refuses chat connections that aren't WebSockets", async () => {
    expect((await call("/do/chat/lobby/ws")).status).toBe(426);
  });

  it("relays chat messages between WebSocket clients", async () => {
    const connect = async (name: string) => {
      const res = await call(`/do/chat/test-room/ws?name=${name}`, { headers: { upgrade: "websocket" } });
      const ws = res.webSocket!;
      const messages: { type: string; [k: string]: unknown }[] = [];
      ws.addEventListener("message", (e) => { if (e.data !== "pong") messages.push(JSON.parse(e.data as string)); });
      ws.accept();
      return { ws, messages };
    };
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
      expect(check()).toBe(true);
    };

    const alice = await connect("alice");
    const bob = await connect("bob");
    alice.ws.send("hello bob");
    await until(() => bob.messages.some((m) => m.type === "message"));
    expect(bob.messages.find((m) => m.type === "message")).toMatchObject({ message: { name: "alice", text: "hello bob" } });

    bob.ws.close(1000, "bye");
    await until(() => alice.messages.some((m) => m.type === "presence" && m.event === "left"));
    alice.ws.close(1000, "bye");
  });
});
