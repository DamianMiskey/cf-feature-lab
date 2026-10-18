# Cloudflare Feature Lab

A hands-on tour of Cloudflare's developer platform. Each page in the dashboard demos one feature live on this Worker, explains it, and shows the Worker code behind it.

**Stack:** Worker + Static Assets · Hono (API) · React + Vite (`@cloudflare/vite-plugin`) · Free plan only.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # local secrets
npm run db:migrate:local         # create the D1 tables in the local database
npm run dev                      # Vite + workerd (the real Workers runtime) at http://localhost:5173
```

## Deploy it

```bash
npx wrangler login               # one-time, opens the browser
npx wrangler secret put DEMO_SECRET
npm run deploy                   # build → wrangler deploy → apply D1 migrations remotely
npx wrangler tail                # stream live logs from production
```

On the first deploy, Wrangler **creates the KV namespace, D1 database and R2 bucket for you**. Bindings in `wrangler.jsonc` have no IDs, and Wrangler remembers the resources it provisioned. R2 has to be enabled once in the dashboard first (R2 → Overview), which may ask for a payment method even on the free plan.

**AI is never simulated locally.** Workers AI and Vectorize (`remote: true`) call your real Cloudflare account even in `npm run dev`, and that counts toward the free allowance of 10,000 neurons per day. The Vectorize index was created once with:

```bash
npx wrangler vectorize create cf-feature-lab-notes --dimensions=768 --metric=cosine
npx wrangler vectorize create-metadata-index cf-feature-lab-notes --propertyName=tag --type=string
```

Phase 5 created two queues once with `npx wrangler queues create cf-feature-lab-jobs` and `… cf-feature-lab-dlq`. Workflows and Cron Triggers need no setup beyond `wrangler.jsonc`.

**Live:** https://lab.djmiskey.com (Workers Custom Domain). `admin.djmiskey.com` is the same Worker behind Cloudflare Access. `workers.dev` is switched off.
**Pages sibling:** https://cf-feature-lab-pages.pages.dev (source in `../cf-feature-lab-pages`)

**Local vs production data:** KV, D1, R2, Durable Objects and Queues each have separate local copies (`.wrangler/state`) and production copies. The Vectorize index is **shared**, because it's a remote binding. Clicking "Sync" locally indexes your *local* notes, so after adding notes in production, sync from the live site.

**Phase 6 notes:**
- The Cache API is per data center: each Cloudflare location keeps its own copy.
- The rate limiter is exact locally but approximate in production. Bursts may get a few extra requests through.
- Every POST, PUT and DELETE is limited to 30 per minute per IP (`worker/middleware.ts`).
- Analytics Engine only receives writes from the deployed Worker. To read them, create an API token with *Account Analytics: Read* and run `npx wrangler secret put CF_ANALYTICS_TOKEN` (and add it to `.dev.vars` for local use).

**Hyperdrive + Neon setup** (done once):
- The folder is linked to the Neon project with `neon link` (see `.neon`). `neon env pull` writes `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) to `.env.local`, which is gitignored.
- The Hyperdrive config `cf-feature-lab-pg` was created from the **unpooled** URL, because Hyperdrive does its own pooling.
- Local dev: `vite.config.ts` passes `DATABASE_URL_UNPOOLED` to local Hyperdrive. Locally there's no Cloudflare pool, so both sides of the comparison look the same.
- The `NEON_DATABASE_URL` secret (the pooled URL) powers the "direct, no Hyperdrive" comparison.
- The driver is `pg`, which Neon's skill recommends for Cloudflare + Hyperdrive. It's loaded lazily, so tests and other routes never import it.
- Neon tooling for Claude Code: `.mcp.json` (Neon MCP server via OAuth, limited to this project) and `.claude/skills/neon*`.

**Browser Run** (formerly Browser Rendering): the free plan allows 10 browser-minutes per day and one new browser launch at a time. The Worker reuses warm sessions (`disconnect()` instead of `close()`) and retries when the launch limit is hit.

**Agents SDK:** `worker/agents/LabAgent.ts` is a Durable Object (binding `LabAgent`, migration `v2`) reached at `/agents/lab-agent/<visitor-id>` through `routeAgentRequest()` in `worker/index.ts`. `vite.config.ts` and `vitest.config.ts` include the `agents/vite` plugin to compile `@callable()` decorators. Model: `@cf/zai-org/glm-4.7-flash`, chosen after comparing tool-calling reliability with three other Workers AI models. Chat goes over a WebSocket, so it has its own limiter (`AGENT_LIMITER`, 10 messages per minute).

**Security** (see the Security page):
- Static assets get headers from `public/_headers`: a strict CSP, HSTS, nosniff, frame denial, referrer and permissions policies. API responses get Hono's `secureHeaders()` with a `default-src 'none'` CSP (`worker/middleware.ts`). WebSocket upgrades are skipped because their headers are immutable.
- The CSP was verified by loading all 23 pages through the Chrome DevTools Protocol, with zero violations. After adding a new external source (a script, API or image host), extend the CSP in `public/_headers`.
- Browser Run blocks private, loopback and link-local targets (SSRF). R2 uploads use a type allow-list (no SVG or HTML), and non-viewable files download as attachments.
- **Turnstile** protects public writes (D1 `POST /api/d1/notes`, R2 uploads): `worker/turnstile.ts` checks the token with `siteverify` (10 s timeout), and requires the expected **action** and an allowed **hostname** (`TURNSTILE_HOSTNAMES`). The widget was created with `npx wrangler turnstile widget create` (the CLI side of Turnstile Spin) for the production hostnames only. The secret is the `TURNSTILE_SECRET` Worker secret. Local dev and tests use Cloudflare's public test keys (in `.dev.vars` / `vitest.config.ts`), and tests stub `siteverify` (`test/outbound-stub.ts`). The agent's `addNote` tool writes server-side and is covered by the agent's own rate limit instead.
- **Admin auth**: admin-only routes (`GET /api/security/admin`, `DELETE /api/queues/jobs`) need `Authorization: Bearer <token>` (`worker/admin.ts`). The comparison runs in constant time (SHA-256 + `crypto.subtle.timingSafeEqual`), the check fails closed (503) if the secret is missing, and attempts count toward the rate limit. The token is in the account-level **Secrets Store** `cf-feature-lab` (`d7f8eb10…`) as `lab-admin-token`, bound as `ADMIN_TOKEN`. Set or rotate it with `npx wrangler secrets-store secret create d7f8eb10e11c467c9a14fe766717f001 --name lab-admin-token --scopes workers --remote` (it prompts for the value). The local dev value is the non-secret `local-admin-token-not-secret`.
- **Cloudflare Access** guards `admin.djmiskey.com` (a second Custom Domain on the same Worker). Access asks for a login (one-time PIN to an allowed email) before requests reach the Worker, then forwards a signed JWT in `Cf-Access-Jwt-Assertion`. `worker/access.ts` verifies its signature (team JWKS at `/cdn-cgi/access/certs`), issuer (`ACCESS_TEAM_DOMAIN`) and audience (`ACCESS_AUD`) with `jose`, and `requireAdmin` accepts a valid Access login or the bearer token. A faked header on another hostname fails verification. Tests mint their own RS256 tokens and stub the certs URL (`test/access.test.ts`).
- **Zone security (djmiskey.com, configured in the dashboard)**: WAF custom rule blocking `/.env`, `/wp-admin`, `/.git`; edge rate-limiting rule (20 `/api/` requests per 10 s per IP); Always Use HTTPS; minimum TLS 1.2. These only cover hostnames in the zone, which is why `workers_dev` is `false`. Lab responses carry `Cache-Control: no-transform` (`public/_headers`), so Cloudflare never modifies them: no injected JavaScript Detections, Web Analytics beacon or AI Labyrinth links, and the CSP stays strict. Web Analytics is loaded manually by `src/webAnalytics.ts` (djmiskey.com hostnames only). It reports to the same-origin `/cdn-cgi/rum` (`send.to`), because `cloudflareinsights.com` rejects this token cross-origin, so the CSP only needs `static.cloudflareinsights.com` for the script. Automatic injection stays on for `djmiskey.com`/`www`. The Security page can trigger each one live and reads `/cdn-cgi/trace` for your TLS/HTTP version and key exchange.
- `npm audit`: `basic-ftp` is forced to a patched version with `overrides`. The remaining 3 findings are the unfixable `extract-zip` chain under `@cloudflare/puppeteer`'s Chrome-download tooling, which isn't in the deployed bundle.

**Run one dev server at a time.** Two `npm run dev` processes in this folder share `.wrangler/state` and can break each other. If every `/api` call suddenly fails with "fetch failed" (for example after editing `wrangler.jsonc`), restart `npm run dev`.

Local data (KV, D1, R2) lives in `.wrangler/state/`. Delete that folder to reset.

After editing `wrangler.jsonc`, run `npm run cf-typegen` to regenerate the typed `Env`.

## Continuous deployment (Workers Builds)

The Worker is connected to `github.com/DamianMiskey/cf-feature-lab`. Every push to `main`:

1. installs dependencies
2. runs **`npm test && npm run build`** (a failing test stops the deploy)
3. runs **`npx wrangler deploy && npx wrangler d1 migrations apply DB --remote`**

Preview builds for other branches are off, and would be of limited use here: **Cloudflare doesn't give preview URLs to Workers that define Durable Object classes**, and this lab has four plus the agent. (`wrangler versions upload` still uploads a version, just without a URL.) `npx wrangler preview` (open beta) needs a `previews` block with separate resources for every binding. Pull requests are checked by GitHub Actions instead (below).

## Pull request checks (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR to `main`: generated-types check (`npm run types:check`), `npm run typecheck`, `npm test` and `npm run build`. `main` is protected, so a red PR can't be merged. `worker-configuration.d.ts` is committed and generated from `.dev.vars.example` with `npm run cf-typegen`. Rerun it after changing `wrangler.jsonc` or adding a secret name.

Secrets (`DEMO_SECRET`, `CF_ANALYTICS_TOKEN`, `NEON_DATABASE_URL`) live on the Worker in Cloudflare, not in the repo, so builds don't need them.

## Test it

```bash
npm test          # 89 integration tests inside workerd: KV, D1, R2, DOs (incl. WebSockets + alarms),
                  # Queues, Cron, Workflows (mocked AI step + approval event), Cache API, rate limits
npm run test:watch
```

Tests use `@cloudflare/vitest-plugin` (the successor to `@cloudflare/vitest-pool-workers`). Each test file gets isolated local storage, D1 migrations are applied in `test/apply-migrations.ts`, and `remoteBindings: false` keeps the tests away from your real account. `npm run deploy` runs the tests first and stops if any fail.

## End-to-end tests (Playwright)

```bash
npm run e2e                                        # builds in E2E mode, runs `vite preview`, tests it
BASE_URL=https://lab.djmiskey.com npm run e2e      # the live site: read-only tests + @deployed ones
```

By default Playwright runs `npm run e2e:server`: an `E2E=1` build (`vite.config.ts` then turns **remote bindings off**, points Hyperdrive at a dummy address and keeps storage in `.wrangler/e2e-state`), local D1 migrations into that folder, and `vite preview` on :4317. Nothing reaches the Cloudflare account, Workers AI or Neon, and your local dev data is untouched, so tests there may write. Against `BASE_URL` only tests tagged `@readonly` (and `@deployed`) run.

- `pages.spec`: every page on desktop and a Pixel 7: exceptions, console errors, failed requests, CSP blocks, sideways overflow. Allowed, per page: the inbox's 401 for anonymous visitors, and (locally only) Hyperdrive's and Vectorize's 500s.
- `headers.spec`: `public/_headers` on every page, the API's own CSP, immutable asset caching, SPA fallback vs API 404, admin routes failing closed; `@deployed`: WAF 403s, HTTP→HTTPS, TLS via `/cdn-cgi/trace`, Access in front of `admin.djmiskey.com`.
- `a11y.spec`: axe (WCAG 2.2 A/AA) in light and dark mode, excluding Cloudflare's Turnstile iframe.
- `behaviour.spec` (local only, it writes): KV put/get, a D1 insert through the real Turnstile widget (test keys), a Durable Object counter, the race test, a two-browser WebSocket chat, Cache API MISS→HIT, rate limiting 429s.

Errors from other origins' frames are ignored: on the live site Turnstile's iframe logs its own CSP blocks and Private Access Token 401s. Live runs retry a failed test once; a pass on retry is reported as flaky.

## Learning path

Work through the pages in this order. Each one builds on the last:

1. **Workers basics** → 2. **Static Assets** → 3. **KV** → 4. **D1** → 5. **R2** → 5b. **Hyperdrive** → 6. **Durable Objects** (run the race test!) → 7. **Queues** → 8. **Workflows** → 9. **Workers AI** → 10. **Vectorize** (RAG over your D1 notes) → 10b. **Agents SDK** → 11. **Cache API** → 12. **Rate Limiting** → 12b. **Browser Run** → 13. **Logs & Observability** → 14. **Workers vs Pages**

For each feature: read the page, use the demo, open "Show Worker code", then find the binding in `wrangler.jsonc` and its test in `test/`.

## Layout

| Path | What lives there |
|------|------------------|
| `wrangler.jsonc` | Worker config: assets, vars, and (later) every binding |
| `worker/index.ts` | Hono app on `/api`, plus the Worker's exported handlers |
| `worker/routes/*.ts` | One API module per feature |
| `migrations/*.sql` | D1 schema migrations, applied in order |
| `worker/scheduled.ts`, `worker/queue.ts` | Cron Trigger and queue consumer handlers |
| `worker/workflows/` | Workflow classes |
| `worker/durable-objects/` | Durable Object classes (exported from `worker/index.ts`) |
| `src/features.ts` | Registry of all features; drives the nav and the home page |
| `src/pages/*.tsx` | One page per feature; register it in `src/App.tsx` |
| `test/*.test.ts` | Integration tests, one file per feature group |
| `src/components/` | `FeaturePage`, `Demo`, `JsonView`, `CodePeek` |

**Adding a feature:** write `worker/routes/<x>.ts` and mount it in `worker/index.ts`, add the binding to `wrangler.jsonc` and run `cf-typegen`, build `src/pages/<X>.tsx`, register it in `App.tsx`, then flip `ready: true` in `features.ts`.

## Roadmap

- [x] **Phase 1: Scaffold.** Workers basics (request.cf, vars vs secrets, Web Crypto), Static Assets + SPA routing
- [x] **Phase 2: Storage.** KV (TTL, metadata, list), D1 (CRUD, migrations, transactional batches), R2 (streaming upload, Range, ETags, custom metadata)
- [x] **Phase 3: Stateful.** Durable Objects: named counter over RPC, KV vs DO race test, WebSocket chat (Hibernation API + SQLite history), alarms
- [x] **Phase 4: AI.** Workers AI (streamed chat, image classification, text-to-image, embeddings), Vectorize (semantic search + metadata filter + RAG over D1 notes), AI Gateway (logging + caching)
- [x] **Phase 5: Async.** Cron Triggers (housekeeping every 30 min), Queues (batching, retries, dead-letter queue), Workflows (durable steps, sleep, retries, waitForEvent approval)
- [x] **Phase 6: Edge extras.** Cache API (HIT/MISS/purge), Rate Limiting (demo + 30 writes/min/IP on the whole API), Analytics Engine (a data point per request + SQL queries), Images (transform R2 images). Skipped: Hyperdrive (needs an external Postgres), Browser Rendering
- [x] **Phase 7: Pages.** Sibling project `../cf-feature-lab-pages` (Pages Functions, `_redirects`, `_headers`, 404, shared KV, service binding back to this Worker, branch preview deploys), plus the Workers vs Pages comparison page
- [x] **Phase 12: Email Workers.** `lab@djmiskey.com` is routed to the Worker's `email()` handler (`worker/email.ts`): parse with `postal-mime` → store in D1 (`migrations/0003_emails.sql`) → `forward()` to the verified address → `reply()` (never to automated mail, RFC 3834 signals). The inbox API is admin-only, and the count is public. Replies use the documented `EmailMessage` + `mimetext` raw-MIME form (the plain-object form type-checks but is refused with "original email is not repliable"), and are skipped for mail from the forwarding address, which Cloudflare refuses to reply to.
- [x] **Phase 10: Agents + Git.** `LabAgent` (Agents SDK + `@cloudflare/ai-chat`): streaming chat on Workers AI via AI Gateway, server tools over D1/DOs/R2, a human-approved `addNote` tool, a browser-side tool, `this.schedule()` reminders, live `setState` sync and `@callable()` RPC. The project is now a Git repo.
- [x] **Phase 9: Extras.** Hyperdrive in front of a Neon Postgres database (live: ~2,050 ms direct vs 3–8 ms through Hyperdrive), Browser Run (screenshots, PDFs, scraping, warm-session reuse)
- [x] **Phase 8: Polish.** 28 integration tests at the time (`@cloudflare/vitest-plugin`), Logs & Observability page (Workers Logs, `wrangler tail`, version metadata, gradual rollouts), learning path on the home page
- [x] **Testing.** Playwright end-to-end suite in CI (132 tests locally against an isolated E2E build; read-only and `@deployed` tests against the live site). It found and fixed: white text on Cloudflare orange (2.6:1, now near-black at 6.4:1), unlabelled file inputs, scrollable code boxes unreachable by keyboard, and nine pages wider than a phone
