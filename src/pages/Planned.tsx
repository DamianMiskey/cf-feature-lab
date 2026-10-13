import type { Feature } from "../features";
import { Link } from "../router";

export function Planned({ feature }: { feature: Feature }) {
  return (
    <article className="feature">
      <header className="feature-head">
        <h1>{feature.name}</h1>
        <p className="tagline">{feature.summary}</p>
      </header>
      <section className="demo">
        <h2>Coming in phase {feature.phase}</h2>
        <p>This feature isn't built yet. See the build plan in the README.</p>
        <Link to="/">← Back to all features</Link>
      </section>
    </article>
  );
}
