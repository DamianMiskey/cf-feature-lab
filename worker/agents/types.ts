// Types shared by the agent (Worker) and the Agents page (browser).
// Kept free of Worker-only types so the browser build can import them.
export type Reminder = { id: string; message: string; dueAt: string; firedAt?: string };
export type LabAgentState = { toolCalls: number; lastTool: string | null; reminders: Reminder[] };
