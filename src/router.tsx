import { createContext, useContext, useEffect, useState, type ReactNode, type MouseEvent } from "react";

// A tiny history-API router so the app has real URLs (/kv, /d1, ...).
// Deep links work in production because of `not_found_handling: single-page-application`.
const PathContext = createContext<{ path: string; navigate: (to: string) => void }>({
  path: "/",
  navigate: () => {},
});

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  };

  return <PathContext.Provider value={{ path, navigate }}>{children}</PathContext.Provider>;
}

export const usePath = () => useContext(PathContext);

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const { navigate } = usePath();
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} className={className} onClick={onClick}>{children}</a>;
}
