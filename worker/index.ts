import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import ai from "./routes/ai";
import { analytics as recordAnalytics, limitWrites } from "./middleware";
import { handleQueue, type JobMessage } from "./queue";
import analytics from "./routes/analytics";
import basics from "./routes/basics";
import browserRoutes from "./routes/browser";
import cache from "./routes/cache";
import cron from "./routes/cron";
import d1 from "./routes/d1";
import hyperdrive from "./routes/hyperdrive";
import images from "./routes/images";
import logs from "./routes/logs";
import durable from "./routes/do";
import kv from "./routes/kv";
import queues from "./routes/queues";
import r2 from "./routes/r2";
import ratelimit from "./routes/ratelimit";
import vectorize from "./routes/vectorize";
import workflows from "./routes/workflows";
import { runHousekeeping } from "./scheduled";

// One Hono app handles every /api/* request. Static files (the React app)
// never reach this code: the assets layer serves them first.
const app = new Hono<{ Bindings: Env }>().basePath("/api");

// Middleware runs on every API request, in this order.
app.use("*", recordAnalytics);
app.use("*", limitWrites);

app.route("/basics", basics);
app.route("/kv", kv);
app.route("/d1", d1);
app.route("/r2", r2);
app.route("/do", durable);
app.route("/ai", ai);
app.route("/vectorize", vectorize);
app.route("/cron", cron);
app.route("/queues", queues);
app.route("/workflows", workflows);
app.route("/cache", cache);
app.route("/ratelimit", ratelimit);
app.route("/analytics", analytics);
app.route("/images", images);
app.route("/logs", logs);
app.route("/browser", browserRoutes);
app.route("/hyperdrive", hyperdrive);

app.get("/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.notFound((c) => c.json({ error: `No API route for ${c.req.path}` }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// Durable Object classes must be exported from the Worker's main module.
export { AlarmClock } from "./durable-objects/AlarmClock";
export { ChatRoom } from "./durable-objects/ChatRoom";
export { Counter } from "./durable-objects/Counter";
export { LabAgent } from "./agents/LabAgent";
// So are Workflow classes.
export { OnboardingWorkflow } from "./workflows/OnboardingWorkflow";

// A Worker module's default export maps event types to handlers:
//   fetch     → HTTP requests
//   scheduled → Cron Triggers
//   queue     → batches of messages from Queues
export default {
  // Agent connections (/agents/<agent>/<name>) are routed to the right agent
  // instance first. Everything else goes to the Hono API.
  async fetch(request, env, ctx) {
    return (await routeAgentRequest(request, env)) ?? app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    // waitUntil keeps the Worker alive until the promise settles.
    ctx.waitUntil(runHousekeeping(env, controller.cron, controller.scheduledTime));
  },

  async queue(batch, env) {
    await handleQueue(batch, env);
  },
} satisfies ExportedHandler<Env, JobMessage>;
