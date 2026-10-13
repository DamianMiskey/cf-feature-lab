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
      {open && <pre className="code">{source}</pre>}
    </section>
  );
}
