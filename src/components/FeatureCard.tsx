import type { ReactNode } from "react";

// Standard frame for every feature page: what it is, when to use it, then the live demo.
export function FeaturePage({
  title,
  tagline,
  whatItIs,
  whenToUse,
  docs,
  children,
}: {
  title: string;
  tagline: string;
  whatItIs: ReactNode;
  whenToUse: string[];
  docs: string;
  children: ReactNode;
}) {
  return (
    <article className="feature">
      <header className="feature-head">
        <h1>{title}</h1>
        <p className="tagline">{tagline}</p>
      </header>
      <div className="explain">
        <section>
          <h2>What it is</h2>
          <div>{whatItIs}</div>
        </section>
        <section>
          <h2>When to use it</h2>
          <ul>{whenToUse.map((w) => <li key={w}>{w}</li>)}</ul>
          <a className="docs" href={docs} target="_blank" rel="noreferrer">Official docs ↗</a>
        </section>
      </div>
      {children}
    </article>
  );
}

// A boxed live demo with a title.
export function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="demo">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
