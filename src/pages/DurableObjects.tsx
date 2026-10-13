import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import routeSource from "../../worker/routes/do.ts?raw";
import counterSource from "../../worker/durable-objects/Counter.ts?raw";
import chatSource from "../../worker/durable-objects/ChatRoom.ts?raw";
import alarmSource from "../../worker/durable-objects/AlarmClock.ts?raw";

type Message = { id: number; name: string; text: string; at: string };
type AlarmStatus = { nextAlarm: string | null; label: string | null; rings: { id: number; scheduled_for: string; fired_at: string; label: string }[] };

function CounterDemo() {
  const [input, setInput] = useState("global");
  const name = input || "global";
  const [info, setInfo] = useState<{ count: number; id?: string } | null>(null);
  const load = () => api<{ count: number; id: string }>(`/do/counter/${name}`).then(setInfo);
  useEffect(() => { load(); }, [name]);
  const act = async (action: "increment" | "reset") => {
    const { count } = await api<{ count: number }>(`/do/counter/${name}/${action}`, { method: "POST" });
    setInfo((i) => ({ ...i, count }));
  };
  return (
    <Demo title="1. A named, strongly consistent counter">
      <p>
        <code>env.COUNTER.getByName(name)</code> always reaches the same single instance, wherever in the
        world the request comes from. Open this page in two tabs and click in both: they share one counter.
        Change the name and you get a new, independent object.
      </p>
      <div className="form-row">
        <label>Object name<input value={input} placeholder="global" onChange={(e) => setInput(e.target.value.replace(/[^\w-]/g, "").slice(0, 32))} /></label>
        <span className="big-number">{info?.count ?? "…"}</span>
        <button onClick={() => act("increment")}>+1</button>
        <button className="ghost" onClick={() => act("reset")}>Reset</button>
        <button className="ghost" onClick={load}>Refresh</button>
      </div>
      {info?.id && <p className="muted small">Object ID (derived from the name): <code>{info.id.slice(0, 24)}…</code></p>}
    </Demo>
  );
}

function RaceDemo() {
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setResult(await api("/do/race?n=20", { method: "POST" })); } finally { setBusy(false); }
  };
  return (
    <Demo title="2. Race test: KV vs Durable Object">
      <p>
        The Worker fires 20 concurrent "read the number, add one, write it back" operations at KV, and 20
        concurrent <code>increment()</code> calls at a Durable Object. KV loses most of the updates. The Durable
        Object handles its calls one at a time, so it lands on exactly 20.
      </p>
      <button onClick={run} disabled={busy}>{busy ? "Racing…" : "Run race"}</button>
      {result != null && <JsonView value={result} />}
    </Demo>
  );
}

function ChatDemo() {
  const [room, setRoom] = useState("lobby");
  const [name, setName] = useState(() => `guest-${Math.floor(Math.random() * 1000)}`);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [log, setLog] = useState<(Message | { id: string; system: string })[]>([]);
  const [text, setText] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => socket.current?.close(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [log]);

  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/do/chat/${room}/ws?name=${encodeURIComponent(name)}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setOnline(0); };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const msg = JSON.parse(e.data);
      if (msg.type === "history") setLog(msg.messages);
      if (msg.type === "message") setLog((l) => [...l, msg.message]);
      if (msg.type === "presence") {
        setOnline(msg.online);
        setLog((l) => [...l, { id: crypto.randomUUID(), system: `${msg.name} ${msg.event}` }]);
      }
    };
    socket.current = ws;
  };

  const send = () => {
    if (!text.trim()) return;
    socket.current?.send(text);
    setText("");
  };

  return (
    <Demo title="3. WebSocket chat room (Hibernation API)">
      <p>
        Each room is one Durable Object that holds every connected WebSocket and stores messages in its own
        SQLite database. Open a second tab to chat with yourself. Between messages the object can
        <em> hibernate</em>: it's evicted from memory but the sockets stay open, so idle rooms cost nothing.
      </p>
      {!connected ? (
        <div className="form-row">
          <label>Room<input value={room} onChange={(e) => setRoom(e.target.value.replace(/[^\w-]/g, "").slice(0, 32))} /></label>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button onClick={connect} disabled={!room}>Join room</button>
        </div>
      ) : (
        <>
          <p className="small"><span className="dot" /> Connected to <code>{room}</code> · {online} online · <button className="ghost" onClick={() => socket.current?.close()}>Leave</button></p>
          <div className="chat-log">
            {log.length === 0 && <p className="muted small">No messages yet.</p>}
            {log.map((m) => "system" in m
              ? <p key={m.id} className="muted small">— {m.system}</p>
              : <p key={m.id}><strong>{m.name}</strong> <span className="muted small">{new Date(m.at).toLocaleTimeString()}</span><br />{m.text}</p>)}
            <div ref={bottom} />
          </div>
          <form className="form-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="grow">Message<input value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
            <button type="submit">Send</button>
          </form>
        </>
      )}
    </Demo>
  );
}

function AlarmDemo() {
  const [status, setStatus] = useState<AlarmStatus | null>(null);
  const [seconds, setSeconds] = useState("5");
  const [label, setLabel] = useState("Ding!");
  const load = () => api<AlarmStatus>("/do/alarm").then(setStatus);
  useEffect(() => { load(); }, []);
  // Poll while an alarm is pending so you can watch it fire.
  useEffect(() => {
    if (!status?.nextAlarm) return;
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [status?.nextAlarm]);

  const schedule = async () => setStatus(await api<AlarmStatus>("/do/alarm", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seconds: Number(seconds), label }),
  }));
  const cancel = async () => setStatus(await api<AlarmStatus>("/do/alarm", { method: "DELETE" }));

  return (
    <Demo title="4. Alarms: an object that wakes itself up">
      <p>
        <code>ctx.storage.setAlarm(time)</code> makes the runtime call the object's <code>alarm()</code> method
        at that time, even if no request ever comes in. If <code>alarm()</code> throws, it's retried. Use alarms
        for reminders, cleanup and batching. Close this tab and come back: the alarm still fires.
      </p>
      <div className="form-row">
        <label>Seconds from now<input value={seconds} onChange={(e) => setSeconds(e.target.value)} inputMode="numeric" /></label>
        <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <button onClick={schedule}>Set alarm</button>
        <button className="ghost" onClick={cancel} disabled={!status?.nextAlarm}>Cancel</button>
      </div>
      <p className="small">
        {status?.nextAlarm
          ? <>⏰ <strong>{status.label}</strong> is set for {new Date(status.nextAlarm).toLocaleTimeString()}</>
          : <span className="muted">No alarm pending.</span>}
      </p>
      {status && status.rings.length > 0 && (
        <table className="table">
          <thead><tr><th>Label</th><th>Scheduled for</th><th>Fired at</th><th>Delay</th></tr></thead>
          <tbody>
            {status.rings.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td className="small">{new Date(r.scheduled_for).toLocaleTimeString()}</td>
                <td className="small">{new Date(r.fired_at).toLocaleTimeString()}</td>
                <td className="small muted">{new Date(r.fired_at).getTime() - new Date(r.scheduled_for).getTime()} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Demo>
  );
}

export function DurableObjects() {
  return (
    <FeaturePage
      title="Durable Objects"
      tagline="Small stateful servers you create by name, each with its own storage. Cloudflare's building block for coordination."
      docs="https://developers.cloudflare.com/durable-objects/"
      whatItIs={<p>
        A Durable Object class is like a JavaScript class whose instances live on Cloudflare. Each instance
        has a unique name or ID, runs in <strong>exactly one place</strong> at a time, handles requests
        <strong> one at a time</strong>, and has its own private <strong>SQLite database</strong>.
        A Worker calls its methods over RPC through a stub. Objects can hold WebSockets, set alarms, and are
        created the first time you use a name. Free plan: 100k requests per day, 5 GB storage.
      </p>}
      whenToUse={[
        "Anything that needs one source of truth: counters, inventory, rate limits, locks",
        "Real-time collaboration: chat, multiplayer games, shared documents",
        "One database per user, per tenant or per document",
      ]}
    >
      <CounterDemo />
      <RaceDemo />
      <ChatDemo />
      <AlarmDemo />
      <CodePeek file="worker/routes/do.ts" source={routeSource} />
      <CodePeek file="worker/durable-objects/Counter.ts" source={counterSource} />
      <CodePeek file="worker/durable-objects/ChatRoom.ts" source={chatSource} />
      <CodePeek file="worker/durable-objects/AlarmClock.ts" source={alarmSource} />
    </FeaturePage>
  );
}
