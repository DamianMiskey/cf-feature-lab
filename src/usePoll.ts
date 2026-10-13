import { useEffect } from "react";

// Calls `fn` now and then every `ms` while `active` is true.
export function usePoll(fn: () => void, ms: number, active = true) {
  useEffect(() => {
    if (!active) return;
    fn();
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
