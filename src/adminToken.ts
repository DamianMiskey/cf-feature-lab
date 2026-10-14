// The admin token lives only in this tab's sessionStorage (gone when the tab
// closes), never in localStorage or the code.
const KEY = "lab-admin-token";
export const getAdminToken = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };
export const setAdminToken = (t: string) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
export const adminHeaders = (): Record<string, string> => { const t = getAdminToken(); return t ? { authorization: `Bearer ${t}` } : {}; };
