// Cloudflare Web Analytics, installed manually. public/_headers sets
// `Cache-Control: no-transform`, so Cloudflare no longer injects it. The token
// is public: it identifies the djmiskey.com site. Only load it on that
// domain. Cloudflare rejects beacons from other origins (e.g. localhost).
const TOKEN = "2845f454b4f14cb1a1ffb42e553bfe3b";

export function loadWebAnalytics() {
  if (!location.hostname.endsWith("djmiskey.com")) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.dataset.cfBeacon = JSON.stringify({ token: TOKEN, spa: true });
  document.body.appendChild(s);
}
