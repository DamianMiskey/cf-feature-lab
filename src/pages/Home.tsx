import { categories, features } from "../features";
import { Link } from "../router";

// The order that builds understanding best: each step uses ideas from the one before.
const LEARNING_PATH: [string, string][] = [
  ["basics", "what a Worker is, and how env, vars and secrets work"],
  ["assets", "how this site is served"],
  ["kv", "the simplest storage, and what eventual consistency means"],
  ["d1", "a real SQL database"],
  ["r2", "files and objects"],
  ["hyperdrive", "bringing your own Postgres, made fast"],
  ["durable-objects", "strong consistency, WebSockets and alarms (the race test shows why it matters)"],
  ["queues", "moving work into the background"],
  ["workflows", "durable multi-step processes"],
  ["email", "a third kind of event: incoming email"],
  ["ai", "running models"],
  ["vectorize", "semantic search and RAG, combining AI + D1"],
  ["agents", "everything together: an AI agent with tools, memory, schedules and live state"],
  ["cache", "edge caching"],
  ["rate-limiting", "protecting all of the above"],
  ["browser", "a real browser for screenshots, PDFs and scraping"],
  ["security", "protecting it: headers, input checks, bot checks and auth"],
  ["observability", "seeing it all in production"],
  ["pages", "how the classic Pages product compares"],
];

export function Home() {
  const ready = features.filter((f) => f.ready).length;
  return (
    <article>
      <header className="feature-head">
        <h1>Cloudflare Feature Lab</h1>
        <p className="tagline">
          One page per Cloudflare developer feature, each with a live demo running on this Worker.
          {" "}{ready} of {features.length} built so far.
        </p>
      </header>
      <section className="how">
        <h2>How this app runs</h2>
        <ol>
          <li>Your browser requests a page. Cloudflare's <strong>Static Assets</strong> layer serves the React app straight from the edge, without running any Worker code.</li>
          <li>The React app calls <code>/api/*</code>. Those requests run the <strong>Worker</strong> (<code>worker/index.ts</code>) in the Cloudflare data center closest to you.</li>
          <li>The Worker reaches storage, databases, AI and other services through <strong>bindings</strong> declared in <code>wrangler.jsonc</code>. A binding is a ready-made client, so there are no connection strings or API keys.</li>
        </ol>
      </section>
      <section className="how">
        <h2>Start here: a suggested path</h2>
        <ol className="path">
          {LEARNING_PATH.map(([slug, why]) => {
            const f = features.find((x) => x.slug === slug)!;
            return <li key={slug}><Link to={`/${slug}`}>{f.name}</Link> <span className="muted">— {why}</span></li>;
          })}
        </ol>
      </section>
      {categories.map((cat) => (
        <section key={cat} className="grid-section">
          <h2>{cat}</h2>
          <div className="grid">
            {features.filter((f) => f.category === cat).map((f) => (
              <Link key={f.slug} to={`/${f.slug}`} className={`tile${f.ready ? "" : " pending"}`}>
                <span className="tile-name">{f.name}</span>
                <span className="tile-sum">{f.summary}</span>
                <span className="badge">{f.ready ? "Live" : `Phase ${f.phase}`}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
