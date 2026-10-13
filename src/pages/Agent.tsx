import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useEffect, useRef, useState } from "react";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import type { LabAgentState, Reminder } from "../../worker/agents/types";
import source from "../../worker/agents/LabAgent.ts?raw";

// Each browser gets its own agent instance (its own chat history and state).
function visitorId() {
  try {
    const existing = localStorage.getItem("lab-agent-id");
    if (existing) return existing;
    const id = `visitor-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("lab-agent-id", id);
    return id;
  } catch {
    return "visitor-shared";
  }
}

const SUGGESTIONS = [
  "How many notes and files are in the lab?",
  "Search the notes for Workers",
  "Increment the counter called agent-demo",
  "Remind me in 20 seconds to stretch",
  "Add a note from me saying 'Agents remember things', tagged agents",
  "What's my time zone?",
];

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string; approval?: { id: string; approved?: boolean } };

export function Agent() {
  const [name] = useState(visitorId);
  const [state, setState] = useState<LabAgentState | null>(null);
  const [toast, setToast] = useState<Reminder | null>(null);
  const [rpcResult, setRpcResult] = useState<unknown>(null);
  const [input, setInput] = useState("");
  const seenFired = useRef(new Set<string>());
  const bottom = useRef<HTMLDivElement>(null);

  // useAgent opens a WebSocket to /agents/lab-agent/<name> and keeps `state` in sync.
  const agent = useAgent<LabAgentState>({
    agent: "lab-agent",
    name,
    onStateUpdate: (s) => setState(s),
  });

  // useAgentChat layers AI SDK chat on top: history, streaming and tools.
  const { messages, sendMessage, clearHistory, status, addToolApprovalResponse } = useAgentChat({
    agent,
    // Client-side tool: the agent asks, the browser answers.
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName === "getBrowserInfo") {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            screen: `${screen.width}×${screen.height}`,
          },
        });
      }
    },
  });

  // Pop up reminders when the agent's schedule fires them (they arrive via state sync).
  useEffect(() => {
    for (const r of state?.reminders ?? []) {
      if (r.firedAt && !seenFired.current.has(r.id)) {
        seenFired.current.add(r.id);
        if (Date.now() - new Date(r.firedAt).getTime() < 60_000) setToast(r);
      }
    }
  }, [state]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInput("");
  };
  const busy = status === "submitted" || status === "streaming";

  return (
    <FeaturePage
      title="Agents SDK"
      tagline="Stateful AI agents that remember, schedule work, use tools and sync in real time. Each one is a Durable Object."
      docs="https://developers.cloudflare.com/agents/"
      whatItIs={<p>
        The <code>agents</code> package turns a Durable Object into an <strong>agent</strong>: it keeps chat history in its own
        SQLite database, holds <code>state</code> that syncs live to every connected tab, wakes itself up with
        <code> this.schedule()</code>, and exposes <code>@callable()</code> methods to the browser. <code>AIChatAgent</code> adds
        streaming chat on the AI SDK with <strong>tools</strong>: server tools, browser tools, and tools that need your <strong>approval</strong>.
        This agent's tools use the rest of the lab: D1 notes, Durable Object counters, R2 and Workers AI.
      </p>}
      whenToUse={[
        "Chat assistants that act on your app's data",
        "Long-running, per-user AI workflows that remember context",
        "Anything needing real-time sync, scheduling and AI together",
      ]}
    >
      {toast && (
        <div className="toast" role="status">
          ⏰ <strong>Reminder:</strong> {toast.message}
          <button className="ghost" onClick={() => setToast(null)}>Dismiss</button>
        </div>
      )}

      <Demo title="Chat with the lab agent">
        <p className="small muted">You're talking to instance <code>{name}</code>. Reload the page and the conversation is still here, because it's stored in the agent. Limited to 10 messages a minute for everyone.</p>
        <div className="chat-log agent-log">
          {messages.length === 0 && <p className="muted small">Try one of the suggestions below.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`msg msg-${m.role}`}>
              <strong className="small">{m.role === "user" ? "You" : "Agent"}</strong>
              {m.parts.map((part, i) => {
                if (part.type === "text") return <p key={i}>{part.text}</p>;
                if (part.type === "reasoning") return <details key={i} className="small muted"><summary>Thinking…</summary>{part.text}</details>;
                if (part.type.startsWith("tool-")) {
                  const t = part as unknown as ToolPart;
                  const toolName = t.type.slice(5);
                  return (
                    <div key={i} className="tool-call">
                      <span className="small">🔧 <code>{toolName}</code> <span className={`status status-${t.state === "output-available" ? "done" : t.state === "output-error" ? "dead" : "running"}`}>{t.state}</span></span>
                      {t.input != null && <code className="small muted tool-io">{JSON.stringify(t.input)}</code>}
                      {t.state === "approval-requested" && t.approval && (
                        <div className="form-row">
                          <button onClick={() => addToolApprovalResponse({ id: t.approval!.id, approved: true })}>Approve</button>
                          <button className="ghost" onClick={() => addToolApprovalResponse({ id: t.approval!.id, approved: false })}>Reject</button>
                        </div>
                      )}
                      {t.output != null && <code className="small tool-io">→ {JSON.stringify(t.output).slice(0, 300)}</code>}
                      {t.errorText && <span className="error small">{t.errorText}</span>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}
          {busy && <p className="muted small">Agent is working…</p>}
          <div ref={bottom} />
        </div>
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <label className="grow">Message<input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} /></label>
          <button type="submit" disabled={busy || !input.trim()}>Send</button>
          <button type="button" className="ghost" onClick={() => clearHistory()}>Clear history</button>
        </form>
        <div className="suggestions">
          {SUGGESTIONS.map((s) => <button key={s} className="ghost small" disabled={busy} onClick={() => send(s)}>{s}</button>)}
        </div>
      </Demo>

      <Demo title="Live agent state (synced over the WebSocket)">
        <p>This updates instantly whenever the agent calls <code>setState()</code>. Open this page in a second tab and watch both change.</p>
        {state && (
          <div className="agent-state">
            <span><strong className="big-number">{state.toolCalls}</strong> tool calls</span>
            <span>Last tool: <code>{state.lastTool ?? "—"}</code></span>
          </div>
        )}
        {state && state.reminders.length > 0 && (
          <table className="table">
            <thead><tr><th>Reminder</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{state.reminders.map((r) => (
              <tr key={r.id}><td>{r.message}</td><td className="small">{new Date(r.dueAt).toLocaleTimeString()}</td>
                <td><span className={`status status-${r.firedAt ? "done" : "waiting"}`}>{r.firedAt ? "fired" : "scheduled"}</span></td></tr>
            ))}</tbody>
          </table>
        )}
        <div className="form-row">
          <button className="ghost" onClick={async () => setRpcResult(await agent.stub.stats())}>agent.stub.stats()</button>
          <button className="ghost" onClick={async () => setRpcResult(await agent.stub.clearReminders())}>agent.stub.clearReminders()</button>
          <span className="small muted">@callable() methods, called like local functions</span>
        </div>
        {rpcResult != null && <JsonView value={rpcResult} />}
      </Demo>

      <CodePeek file="worker/agents/LabAgent.ts" source={source} />
    </FeaturePage>
  );
}
