import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Minimal typing for the Turnstile script's global.
declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }): string;
      reset(id: string): void;
      remove(id: string): void;
    };
  }
}

// Load the Turnstile script once per page, with explicit rendering.
let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let siteKeyPromise: Promise<string> | null = null;
const getSiteKey = () => (siteKeyPromise ??= api<{ siteKey: string }>("/security/turnstile").then((r) => r.siteKey));

// Renders the widget and reports the token. `action` must match what the
// Worker expects for that route (e.g. "add-note"). Change `resetKey` after a
// submit to get a fresh token, since each token works only once.
export function Turnstile({ action, onToken, resetKey = 0 }: { action: string; onToken: (token: string | null) => void; resetKey?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    onToken(null);
    Promise.all([loadScript(), getSiteKey()])
      .then(([, sitekey]) => {
        if (cancelled || !el.current || !window.turnstile) return;
        widgetId = window.turnstile.render(el.current, {
          sitekey,
          action,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => { onToken(null); setError("Turnstile couldn't verify this browser. Try reloading."); },
        });
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [action, resetKey]);

  return (
    <div className="turnstile">
      <div ref={el} />
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
