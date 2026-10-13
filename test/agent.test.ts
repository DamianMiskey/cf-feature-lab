import { env, SELF } from "cloudflare:test";
import { getAgentByName } from "agents";
import { describe, expect, it } from "vitest";

// These tests exercise the agent's state, schedules and routing without
// calling the AI model.
describe("Agents SDK: LabAgent", () => {
  it("starts with empty state", async () => {
    const agent = await getAgentByName(env.LabAgent, "test-fresh");
    expect(await agent.stats()).toMatchObject({ toolCalls: 0, lastTool: null, reminders: [], pendingSchedules: 0, messages: 0 });
  });

  it("schedules a reminder, then marks it fired when the schedule runs", async () => {
    const agent = await getAgentByName(env.LabAgent, "test-reminders");
    const { scheduled } = await agent.addReminder("stretch", 30);
    expect(scheduled).toMatchObject({ message: "stretch", dueAt: expect.any(String) });
    expect((await agent.stats()).pendingSchedules).toBe(1);

    // The scheduler only runs tasks that are due, so instead of waiting 30 s,
    // call the scheduled callback directly to check its effect on state.
    await agent.fireReminder(scheduled);
    expect((await agent.stats()).reminders[0]).toMatchObject({ message: "stretch", firedAt: expect.any(String) });
  });

  it("clears reminders and cancels their schedules", async () => {
    const agent = await getAgentByName(env.LabAgent, "test-clear");
    await agent.addReminder("one", 60);
    await agent.addReminder("two", 120);
    expect(await agent.clearReminders()).toEqual({ cleared: true });
    expect(await agent.stats()).toMatchObject({ reminders: [], pendingSchedules: 0 });
  });

  it("is reachable at /agents/lab-agent/<name>, and rejects unknown agents", async () => {
    const upgrade = await SELF.fetch("https://lab.test/agents/lab-agent/test-ws", { headers: { upgrade: "websocket" } });
    expect(upgrade.status).toBe(101);
    upgrade.webSocket?.accept();
    upgrade.webSocket?.close();
    expect((await SELF.fetch("https://lab.test/agents/no-such-agent/x", { headers: { upgrade: "websocket" } })).status).toBe(400);
  });
});
