// Single source of truth for the dashboard: every Cloudflare feature in the lab,
// grouped by category. `ready: false` marks features from later build phases.
export type Feature = {
  slug: string;
  name: string;
  category: "Compute" | "Storage & Databases" | "Stateful" | "AI" | "Async" | "Edge" | "Platform";
  summary: string;
  phase: number;
  ready: boolean;
};

export const features: Feature[] = [
  { slug: "basics", name: "Workers basics", category: "Compute", phase: 1, ready: true,
    summary: "Request inspector, request.cf geo data, vars vs secrets." },
  { slug: "assets", name: "Static Assets", category: "Compute", phase: 1, ready: true,
    summary: "How this React app is served from the edge, with SPA fallback." },
  { slug: "kv", name: "Workers KV", category: "Storage & Databases", phase: 2, ready: true,
    summary: "Global, eventually consistent key-value store with TTLs." },
  { slug: "d1", name: "D1", category: "Storage & Databases", phase: 2, ready: true,
    summary: "Serverless SQLite database with migrations and batches." },
  { slug: "r2", name: "R2", category: "Storage & Databases", phase: 2, ready: true,
    summary: "S3-compatible object storage with no egress fees." },
  { slug: "hyperdrive", name: "Hyperdrive", category: "Storage & Databases", phase: 9, ready: true,
    summary: "Fast, pooled, cached access to an external Postgres (Neon)." },
  { slug: "durable-objects", name: "Durable Objects", category: "Stateful", phase: 3, ready: true,
    summary: "Strongly consistent counters, WebSocket chat, alarms." },
  { slug: "ai", name: "Workers AI", category: "AI", phase: 4, ready: true,
    summary: "Run models on Cloudflare's GPUs: text, images, embeddings." },
  { slug: "agents", name: "Agents SDK", category: "AI", phase: 10, ready: true,
    summary: "A stateful AI agent with tools, approvals, schedules and live state." },
  { slug: "vectorize", name: "Vectorize", category: "AI", phase: 4, ready: true,
    summary: "Vector database for semantic search and RAG." },
  { slug: "ai-gateway", name: "AI Gateway", category: "AI", phase: 4, ready: true,
    summary: "Caching, logging and analytics for AI calls." },
  { slug: "cron", name: "Cron Triggers", category: "Async", phase: 5, ready: true,
    summary: "Run Worker code on a schedule." },
  { slug: "queues", name: "Queues", category: "Async", phase: 5, ready: true,
    summary: "Send jobs now, process them in the background." },
  { slug: "workflows", name: "Workflows", category: "Async", phase: 5, ready: true,
    summary: "Durable multi-step processes with sleeps and retries." },
  { slug: "cache", name: "Cache API", category: "Edge", phase: 6, ready: true,
    summary: "Store responses in the data center's cache." },
  { slug: "rate-limiting", name: "Rate Limiting", category: "Edge", phase: 6, ready: true,
    summary: "Built-in per-key request limits." },
  { slug: "analytics-engine", name: "Analytics Engine", category: "Edge", phase: 6, ready: true,
    summary: "Write custom metrics and query them with SQL." },
  { slug: "images", name: "Images", category: "Edge", phase: 6, ready: true,
    summary: "Resize and convert R2 images on the fly." },
  { slug: "browser", name: "Browser Run", category: "Edge", phase: 9, ready: true,
    summary: "Headless Chrome: screenshots, PDFs and scraping." },
  { slug: "observability", name: "Logs & Observability", category: "Platform", phase: 8, ready: true,
    summary: "Workers Logs, wrangler tail, versions, rollouts and tests." },
  { slug: "pages", name: "Workers vs Pages", category: "Platform", phase: 7, ready: true,
    summary: "The classic Pages workflow, compared with Workers + Assets." },
];

export const categories = [...new Set(features.map((f) => f.category))];
