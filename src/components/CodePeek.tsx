import { useState } from "react";

// Shows the Worker source behind a demo. Pages import it with Vite's `?raw`
// suffix, so what you see is exactly the code that runs.
export function CodePeek({ file, source }: { file: string; source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="codepeek">
      <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Show"} Worker code · <code>{file}</code>
      </button>
      {/* tabIndex: a box that scrolls must be reachable by keyboard to scroll it. */}
      {open && <pre className="code" tabIndex={0}>{source}</pre>}
    </section>
  );
}
