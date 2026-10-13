import type { ReactNode } from "react";
import { categories, features } from "../features";
import { Link, usePath } from "../router";

export function Layout({ children }: { children: ReactNode }) {
  const { path } = usePath();
  return (
    <div className="shell">
      <nav className="sidebar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          <span>Feature Lab</span>
        </Link>
        {categories.map((cat) => (
          <div key={cat} className="nav-group">
            <div className="nav-cat">{cat}</div>
            {features.filter((f) => f.category === cat).map((f) => (
              <Link key={f.slug} to={`/${f.slug}`}
                className={`nav-link${path === `/${f.slug}` ? " active" : ""}${f.ready ? "" : " pending"}`}>
                {f.name}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
