import { useState } from "react";
import { api } from "../api";
import { CodePeek } from "../components/CodePeek";
import { Demo, FeaturePage, JsonView } from "../components/FeatureCard";
import { usePoll } from "../usePoll";
import workflowSource from "../../worker/workflows/OnboardingWorkflow.ts?raw";
import routeSource from "../../worker/routes/workflows.ts?raw";

type Run = {
  id: string; name: string; current_step: string; created_at: string;
  log: { at: string; step: string; message: string }[];
  instance: { status: string; error?: { message: string }; output?: unknown };
};

const STEPS = ["create account", "write welcome message", "sleep", "send welcome email", "waiting for approval", "finish"];

export function Workflows() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("Ada");
  const [error, setError] = useState("");
  const load = () => api<{ runs: Run[] }>("/workflows").then((r) => setRuns(r.runs)).catch((e) => setError(e.message));
  const active = runs.some((r) => !["complete", "errored", "terminated"].includes(r.instance.status));
  usePoll(load, active ? 1500 : 10000, true);

  const start = async () => {
    setError("");
    try { await api("/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const act = (id: string, path: string, body?: unknown) => async () => {
    await api(`/workflows/${id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    load();
  };

  return (
    <FeaturePage
      title="Workflows"
      tagline="Durable, multi-step programs that survive crashes, retry failed steps, and can sleep or wait for days."
      docs="https://developers.cloudflare.com/workflows/"
      whatItIs={<p>
        A Workflow is a class with a <code>run(event, step)</code> method. Each piece of work goes in
        <code> step.do()</code>, whose result is <strong>saved</strong>. If anything fails, the step is retried
        on its own schedule, and steps that already finished are never re-run. <code>step.sleep()</code> pauses
        for seconds or weeks without using CPU, and <code>step.waitForEvent()</code> pauses until something outside
        (a webhook, a human) sends an event. It's built on Durable Objects.
      </p>}
      whenToUse={[
        "Sign-up and onboarding flows, order processing, payments",
        "Pipelines that call flaky APIs or AI models",
        "Anything with human approval or multi-day waits",
      ]}
    >
      {error && <p className="error">{error}</p>}
      <Demo title="Start an onboarding workflow">
        <p>Steps: create account → AI writes a welcome → <strong>sleep 10s</strong> → send email (<strong>fails twice, then succeeds</strong>) → <strong>wait for your approval</strong> → finish.</p>
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <label>New user's name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button type="submit">Start workflow</button>
        </form>
      </Demo>

      {runs.map((r) => {
        const reached = new Set(r.log.map((l) => l.step));
        const waiting = r.current_step === "waiting for approval" && !["complete", "errored", "terminated"].includes(r.instance.status);
        return (
          <Demo key={r.id} title={`${r.name} · ${r.id}`}>
            <p className="small">Status: <span className={`status status-${r.instance.status}`}>{r.instance.status}</span> · current step: <strong>{r.current_step}</strong></p>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s} className={r.current_step === s ? "current" : reached.has(s) ? "done" : ""}>{s}</li>
              ))}
            </ol>
            {waiting && (
              <div className="form-row">
                <button onClick={act(r.id, "approval", { approved: true })}>Approve</button>
                <button className="ghost" onClick={act(r.id, "approval", { approved: false })}>Reject</button>
                <span className="small muted">Sends <code>instance.sendEvent({"{ type: \"approval\" }"})</code></span>
              </div>
            )}
            {!["complete", "errored", "terminated"].includes(r.instance.status) && !waiting && (
              <button className="ghost" onClick={act(r.id, "terminate")}>Terminate</button>
            )}
            <table className="table">
              <tbody>{r.log.map((l, i) => (
                <tr key={i}><td className="small muted">{new Date(l.at).toLocaleTimeString()}</td><td className="small"><strong>{l.step}</strong></td><td className="small">{l.message}</td></tr>
              ))}</tbody>
            </table>
            {r.instance.output != null && <JsonView value={r.instance.output} />}
            {r.instance.error && <p className="error">{r.instance.error.message}</p>}
          </Demo>
        );
      })}

      <CodePeek file="worker/workflows/OnboardingWorkflow.ts" source={workflowSource} />
      <CodePeek file="worker/routes/workflows.ts" source={routeSource} />
    </FeaturePage>
  );
}
