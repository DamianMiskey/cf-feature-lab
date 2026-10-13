import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { convertToModelMessages, isStepCount, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { GATEWAY_ID } from "../ai-models";
import type { LabAgentState, Reminder } from "./types";

// A model with reliable tool calling that's cheap on the free neuron budget.
export const AGENT_MODEL = "@cf/zai-org/glm-4.7-flash";


// An agent is a Durable Object with superpowers. Each visitor gets their own
// instance (picked by name), which keeps:
//  - chat history in its own SQLite database (handled by AIChatAgent),
//  - `state` that syncs live to every connected browser tab,
//  - schedules that wake it up later (this.schedule),
//  - @callable() methods the browser can call like local functions.
export class LabAgent extends AIChatAgent<Env, LabAgentState> {
  initialState: LabAgentState = { toolCalls: 0, lastTool: null, reminders: [] };
  maxPersistedMessages = 50;

  async onChatMessage() {
    // Chat arrives over a WebSocket, so the API's rate-limit middleware never
    // sees it. Guard the AI spend here instead.
    const { success } = await this.env.AGENT_LIMITER.limit({ key: "lab-agent" });
    if (!success) throw new Error("The lab agent is rate limited (10 messages per minute). Try again shortly.");

    const workersai = createWorkersAI({ binding: this.env.AI, gateway: { id: GATEWAY_ID } });
    const result = streamText({
      model: workersai(AGENT_MODEL),
      system:
        "You are the Cloudflare Feature Lab assistant. Be brief and friendly. " +
        "Use your tools to look things up or take actions instead of guessing. " +
        "Notes live in a D1 database; counters are Durable Objects. " +
        "When you add a note, the user must approve it first.",
      messages: await convertToModelMessages(this.messages),
      tools: this.tools(),
      // Let the model call tools and then keep going, up to 5 steps per turn.
      stopWhen: isStepCount(5),
    });
    return result.toUIMessageStreamResponse();
  }

  private tools() {
    return {
      searchNotes: tool({
        description: "Search the lab's notes (stored in D1) by keyword.",
        inputSchema: z.object({ query: z.string().describe("A keyword, e.g. 'R2' or 'Workers'") }),
        execute: async ({ query }) => {
          this.track("searchNotes");
          const like = `%${query.slice(0, 50)}%`;
          const { results } = await this.env.DB
            .prepare("SELECT id, author, body, tag FROM notes WHERE body LIKE ? OR tag LIKE ? ORDER BY id DESC LIMIT 5")
            .bind(like, like)
            .all();
          return { matches: results };
        },
      }),

      // Human in the loop: the browser shows Approve / Reject before this runs.
      addNote: tool({
        description: "Add a note to the lab's D1 database.",
        inputSchema: z.object({
          author: z.string().describe("Who the note is from"),
          body: z.string().describe("The note text"),
          tag: z.string().describe("A short tag, e.g. 'workers' or 'agents'"),
        }),
        needsApproval: true,
        execute: async ({ author, body, tag }) => {
          this.track("addNote");
          const note = await this.env.DB
            .prepare("INSERT INTO notes (author, body, tag) VALUES (?, ?, ?) RETURNING id, author, body, tag")
            .bind(author.slice(0, 60), body.slice(0, 500), tag.slice(0, 30) || "agents")
            .first();
          return { saved: note };
        },
      }),

      incrementCounter: tool({
        description: "Increment a named counter. Each counter is a Durable Object.",
        inputSchema: z.object({ name: z.string().describe("Counter name, e.g. 'global'") }),
        execute: async ({ name }) => {
          this.track("incrementCounter");
          const safe = /^[\w-]{1,32}$/.test(name) ? name : "global";
          return { counter: safe, value: await this.env.COUNTER.getByName(safe).increment() };
        },
      }),

      labStats: tool({
        description: "Get current numbers from the lab: notes, queue jobs, files and workflow runs.",
        inputSchema: z.object({}),
        execute: async () => {
          this.track("labStats");
          const [notes, jobs, runs] = await this.env.DB.batch([
            this.env.DB.prepare("SELECT COUNT(*) AS n FROM notes"),
            this.env.DB.prepare("SELECT COUNT(*) AS n FROM jobs"),
            this.env.DB.prepare("SELECT COUNT(*) AS n FROM workflow_runs"),
          ]);
          const files = (await this.env.BUCKET.list({ prefix: "uploads/", limit: 1000 })).objects.length;
          const n = (r: D1Result) => (r.results[0] as { n: number }).n;
          return { notes: n(notes), queueJobs: n(jobs), workflowRuns: n(runs), r2Files: files };
        },
      }),

      setReminder: tool({
        description: "Set a reminder that fires after a delay. The user sees it pop up in the page.",
        inputSchema: z.object({
          message: z.string().describe("What to remind the user about"),
          seconds: z.number().describe("Delay in seconds, between 5 and 3600"),
        }),
        execute: async ({ message, seconds }) => {
          this.track("setReminder");
          return this.addReminder(message, seconds);
        },
      }),

      // No `execute`: this runs in the browser (see onToolCall in the page).
      getBrowserInfo: tool({
        description: "Get the user's browser time zone, language and screen size.",
        inputSchema: z.object({}),
      }),
    };
  }

  private track(toolName: string) {
    this.setState({ ...this.state, toolCalls: this.state.toolCalls + 1, lastTool: toolName });
  }

  async addReminder(message: string, seconds: number) {
    const delay = Math.min(Math.max(Math.round(seconds), 5), 3600);
    const reminder: Reminder = { id: crypto.randomUUID().slice(0, 8), message: message.slice(0, 200), dueAt: "" };
    // schedule() persists the task and wakes the agent up to call fireReminder,
    // even if nobody is connected. Under the hood, it's a Durable Object alarm.
    const schedule = await this.schedule(delay, "fireReminder", reminder);
    // The scheduler works in whole seconds, so report the time it actually stored.
    reminder.dueAt = new Date("time" in schedule ? schedule.time * 1000 : Date.now() + delay * 1000).toISOString();
    this.setState({ ...this.state, reminders: [...this.state.reminders, reminder].slice(-10) });
    return { scheduled: reminder };
  }

  async fireReminder(reminder: Reminder) {
    // State changes sync to every open tab, so the page can pop the reminder up.
    this.setState({
      ...this.state,
      reminders: this.state.reminders.map((r) => (r.id === reminder.id ? { ...r, firedAt: new Date().toISOString() } : r)),
    });
  }

  // @callable() methods can be called from the browser over the agent's WebSocket:
  //   await agent.stub.stats()
  @callable()
  stats() {
    return { ...this.state, pendingSchedules: this.getSchedules().length, messages: this.messages.length };
  }

  @callable()
  async clearReminders() {
    for (const s of this.getSchedules()) await this.cancelSchedule(s.id);
    this.setState({ ...this.state, reminders: [] });
    return { cleared: true };
  }
}
