import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { GATEWAY_ID, MODELS } from "../ai-models";

type Params = { name: string };
type Approval = { approved: boolean };

// A durable, multi-step onboarding process.
//
// The key idea: each step.do() result is saved. If the Worker crashes, is
// redeployed, or a step throws and is retried, the workflow replays run()
// but skips steps that already finished, reusing their saved results.
// Workflows can sleep or wait for days without using any CPU.
export class OnboardingWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const id = event.instanceId;
    const { name } = event.payload;
    // Only log from *inside* steps. Code outside steps runs again on every replay.
    const log = (stepName: string, message: string) => track(this.env, id, stepName, message);

    const account = await step.do("create account", async () => {
      const account = { userId: crypto.randomUUID().slice(0, 8), name };
      await log("create account", `Created user ${account.userId}`);
      return account;
    });

    const welcome = await step.do("write welcome message", { timeout: "30 seconds" }, async () => {
      const { response } = (await this.env.AI.run(
        MODELS.text,
        { messages: [{ role: "user", content: `Write a one-sentence warm welcome for a new user named ${name}. No preamble.` }], max_tokens: 60 },
        { gateway: { id: GATEWAY_ID } },
      )) as { response?: string };
      const text = response?.trim() || `Welcome aboard, ${name}!`;
      await log("write welcome message", text);
      return text;
    });

    await step.do("announce sleep", async () => log("sleep", "Sleeping 10 seconds. The instance hibernates and uses no CPU."));
    await step.sleep("cool-off period", "10 seconds");

    // Retries: this step fails on its first two attempts and succeeds on the third.
    const email = await step.do(
      "send welcome email",
      { retries: { limit: 3, delay: "2 seconds", backoff: "constant" } },
      async (ctx) => {
        if (ctx.attempt < 3) {
          await log("send welcome email", `Attempt ${ctx.attempt} failed (simulated outage). Retrying in 2s…`);
          throw new Error(`Email provider unavailable (attempt ${ctx.attempt})`);
        }
        await log("send welcome email", `Sent on attempt ${ctx.attempt}`);
        return { sentAt: new Date().toISOString(), attempts: ctx.attempt };
      },
    );

    // Human in the loop: pause until someone clicks Approve or Reject (or 10 minutes pass).
    await step.do("announce approval wait", async () => log("waiting for approval", "Waiting for an 'approval' event. Click Approve or Reject."));
    let approved = false;
    try {
      const approval = await step.waitForEvent<Approval>("wait for approval", { type: "approval", timeout: "10 minutes" });
      approved = approval.payload.approved;
    } catch {
      // waitForEvent throws when the timeout passes without an event.
      approved = false;
    }

    return step.do("finish", async () => {
      const result = { ...account, welcome, email, approved };
      await log("finish", approved ? "Approved: onboarding complete 🎉" : "Not approved: account left inactive");
      return result;
    });
  }
}

async function track(env: Env, id: string, stepName: string, message: string) {
  await env.DB
    .prepare("UPDATE workflow_runs SET current_step = ?, log = json_insert(log, '$[#]', json_object('at', ?, 'step', ?, 'message', ?)) WHERE id = ?")
    .bind(stepName, new Date().toISOString(), stepName, message, id)
    .run();
}
