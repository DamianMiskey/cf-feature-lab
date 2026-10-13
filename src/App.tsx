import type { ComponentType } from "react";
import { Layout } from "./components/Layout";
import { features } from "./features";
import { Ai } from "./pages/Ai";
import { AiGateway } from "./pages/AiGateway";
import { AnalyticsEngine } from "./pages/AnalyticsEngine";
import { Assets } from "./pages/Assets";
import { Basics } from "./pages/Basics";
import { BrowserRun } from "./pages/BrowserRun";
import { Cache } from "./pages/Cache";
import { Cron } from "./pages/Cron";
import { D1 } from "./pages/D1";
import { DurableObjects } from "./pages/DurableObjects";
import { Home } from "./pages/Home";
import { Hyperdrive } from "./pages/Hyperdrive";
import { Images } from "./pages/Images";
import { Kv } from "./pages/Kv";
import { Observability } from "./pages/Observability";
import { Pages } from "./pages/Pages";
import { Planned } from "./pages/Planned";
import { Queues } from "./pages/Queues";
import { R2 } from "./pages/R2";
import { RateLimiting } from "./pages/RateLimiting";
import { Vectorize } from "./pages/Vectorize";
import { Workflows } from "./pages/Workflows";
import { Link, Router, usePath } from "./router";

// Register each finished feature page here, keyed by its slug in features.ts.
const pages: Record<string, ComponentType> = {
  basics: Basics,
  assets: Assets,
  kv: Kv,
  d1: D1,
  r2: R2,
  "durable-objects": DurableObjects,
  ai: Ai,
  vectorize: Vectorize,
  "ai-gateway": AiGateway,
  cron: Cron,
  queues: Queues,
  workflows: Workflows,
  cache: Cache,
  "rate-limiting": RateLimiting,
  "analytics-engine": AnalyticsEngine,
  images: Images,
  pages: Pages,
  observability: Observability,
  browser: BrowserRun,
  hyperdrive: Hyperdrive,
};

function Routes() {
  const { path } = usePath();
  if (path === "/") return <Home />;
  const slug = path.slice(1);
  const Page = pages[slug];
  if (Page) return <Page />;
  const feature = features.find((f) => f.slug === slug);
  if (feature) return <Planned feature={feature} />;
  return (
    <article className="feature">
      <h1>Not found</h1>
      <p>No page at <code>{path}</code>. The assets layer returned index.html, so React handles the 404.</p>
      <Link to="/">← Home</Link>
    </article>
  );
}

export default function App() {
  return (
    <Router>
      <Layout><Routes /></Layout>
    </Router>
  );
}
