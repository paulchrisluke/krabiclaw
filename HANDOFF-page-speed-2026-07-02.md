# Handoff: KrabiClaw page speed — stop adding, start removing

Written for whoever picks this up next (Codex or otherwise). The person who
asked for this handoff explicitly said: *"you are making things worse... you
keep adding more code rather than finding and removing over-customizations...
this is typical nuxt, nitro, cloudflare, we should be removing undocumented
approaches."* Take that as the operating instruction for this handoff, not a
suggestion. Read it before touching anything.

## The actual evidence, as of right now

Real PageSpeed Insights runs (Google's infrastructure, mobile, slow 4G
throttling — not a local sandbox, not simulated):

- `www.kikuzuki-thailand.com/contact` — a form page with **no meaningful
  hero image**: Performance 82, **FCP 2.9s**, **LCP 3.6s**, Speed Index 4.0s,
  TBT 140ms (good), CLS 0 (good).
- `krabiclaw.com/features` — an **all-text marketing page**: Speed Index
  ~4s.

Both pages are slow despite having essentially no image weight to speak of.
**This disproves "it's the hero images" as the primary cause.** TBT and CLS
are consistently fine across every page tested — the problem is concentrated
in FCP/LCP/Speed Index, which point at time-to-first-paint, not JS blocking
or layout instability.

## What's actually been fixed and verified (keep these, don't revert)

1. **`server/plugins/edge-cache.ts` Set-Cookie bug** (merged to `main`,
   deployed). The full-HTML KV cache had a permanent 0% hit rate because
   analytics cookies (`kc_visitor_id`/`kc_session_id`, set on literally every
   request) tripped a blanket `if (setCookieHeader) return` in the cache
   write path. Fixed to only bail on the real auth cookie. **Verified via
   production `wrangler tail`**: cache MISS = 2296ms wallTime/106ms cpuTime,
   HIT = 281ms wallTime/10ms cpuTime (~8x/~10x). This is real and confirmed
   on multiple pages (tenant home, platform `/blog`) — TTFB/server-response
   is now consistently ~250-600ms on a cache hit everywhere it's been tested.

2. **Self-fetch elimination** (branch `perf/self-fetch-and-ci-measurement`,
   PR #125, open — not yet merged to `main`, but deployed directly to
   production for testing). One SSR render was triggering ~9 internal
   self-fetches (i18n messages, nuxt-icon collections, `/api/billing/plans`)
   that re-enter the whole Nitro middleware pipeline with zero Cloudflare
   bindings attached. Guarded `db-foreign-keys.ts` and `tenant-resolution.ts`
   against doing real work on these; eliminated the `/api/billing/plans`
   self-fetch entirely via `server/middleware/zz-platform-plans-prefetch.ts`
   (runs on the real inbound request, which has bindings, stashes cached
   Stripe plan data on `event.context`). **Verified**, but this only affects
   the platform homepage specifically — not a global fix.

**Neither of these moved FCP/LCP meaningfully on the pages the user just
tested.** They fixed real, measured server-side/backend costs. The remaining
problem is client-side or render-path, not backend.

## What was tried today and did NOT solve it (be skeptical of repeating this pattern)

3. **Cloudflare Images flexible variants + `utils/cf-image.ts`** — enabled
   flexible variants on the account, added responsive `srcset`/quality/format
   params to the Saya hero image. Confirmed the actual image file shrank 72%
   (277KB→78KB) and total page weight on pottery-house dropped 892KB→619KB.
   **LCP barely moved** (5.6s baseline → 5.7-6.1s across repeated runs,
   within noise). This is now further undermined by the user's new evidence:
   pages with no images are equally slow, so image size was never the
   dominant lever globally, even though it was a real, legitimate fix worth
   keeping for the byte savings.

4. **Consolidated a duplicate inline hero implementation** in `pages/index.vue`
   that had drifted from `components/saya/SayaHomeHero.vue` — this was a real
   bug (my image fix in #3 was initially silently no-op'd because the inline
   copy, not the component, was what actually rendered for pottery-house),
   and consolidating also fixed a live regression risk (hardcoded restaurant
   CTA copy would have shipped on experience-vertical tenants — the exact
   canonical Pottery House bug CLAUDE.md warns about) and a broken
   admin-preview attribute. Worth keeping as a correctness fix, but again,
   did not move FCP/LCP on the pages that matter for this investigation.

5. **`<link rel="preconnect" href="https://imagedelivery.net">`** in
   `nuxt.config.ts` — added to shave the DNS+TCP+TLS setup cost for the
   third-party image CDN origin. First attempt had a `crossorigin` mismatch
   bug (preconnect specified `crossorigin`, but the actual `<img>` tags don't,
   so Chrome opens an unused connection and a second real one — a known
   footgun). Fixed, but **NOT YET DEPLOYED** — built locally, not committed.
   This is a marginal, defensible optimization but was never going to be the
   answer given the image-free-page evidence above. Low risk to ship or
   discard; your call.

**Pattern to notice**: every fix so far has been additive — new middleware,
new utility files, new config, new dependencies (`lighthouse` was just added
as a devDependency). None of it has moved the actual FCP/LCP number on a
representative page. That's the signal to stop adding and start subtracting.

## Testing process / methodology (what's reliable, what isn't)

- **`yarn build && npx wrangler dev` + `npx wrangler tail --format json`**
  (or the local console output from `wrangler dev` directly) — the only
  reliable way to see real Worker-side timing (`wallTime`/`cpuTime`) and to
  reproduce self-fetch/binding behavior faithfully. **`nuxt dev` hides this**
  — it doesn't code-split or dispatch internal requests the same way the real
  Cloudflare Workers build does. Always verify against a real build.
- **`wrangler tail`'s `wallTime`/`cpuTime`** is the trustworthy signal for
  server-side changes — not confounded by client network conditions.
- **Local `npx lighthouse` runs from this dev sandbox are NOT reliable for
  absolute LCP/FCP/Speed Index numbers.** Confirmed this directly: a bare
  `curl` to `cloudflare.com` (nothing to do with this app) from this sandbox
  shows ~0.5-0.8s of TLS handshake time alone. Every Lighthouse run executed
  locally in this environment inherits that same confound. A new script,
  `scripts/lighthouse-check.mjs` (`yarn perf:lighthouse --url <url> --runs 3`),
  was added this session to at least get median-of-N instead of single-sample
  noise, but **treat its LCP/FCP/Speed Index numbers as directional only,
  never authoritative.**
- **The only authoritative source for LCP/FCP/Speed Index is
  https://pagespeed.web.dev/ run by a human**, or the PSI API with a real API
  key (unauthenticated quota is 0/day — hit that wall early this session).
  The screenshots the user pasted this session are the ground truth data;
  everything measured locally should be treated as secondary.
- **Cloudflare Images API** (`accounts/{id}/images/v1/*`, `.env`'s
  `CLOUDFLARE_API_TOKEN`) — used to inspect/enable flexible variants
  directly, confirmed via curl before touching code.
- **Purge both cache layers after every deploy when testing**: the app's own
  `SITE_CACHE` KV (`DELETE .../storage/kv/namespaces/{ns}/values/{key}`,
  key format `html:<host>:<path>`) AND Cloudflare's own edge/CDN cache
  (`POST .../zones/{zone}/purge_cache`) — these are two separate layers and
  purging only one leaves stale content served from the other. This cost
  real time today (spent a while debugging why a deployed fix "didn't take"
  before realizing both needed purging).

## Recommended next step: audit for removal, not addition

The user's framing is almost certainly right: this is "typical Nuxt, Nitro,
Cloudflare" — meaning the slow FCP/LCP is likely either (a) inherent to how
this app's SSR/hydration pipeline works on Cloudflare Workers, independent of
per-page content, or (b) caused by custom middleware/plugins/config that run
on every single request regardless of what's on the page. Given TTFB is
already confirmed fast (~250-600ms) on every page tested via `wrangler tail`,
and FCP/LCP is still bad even on content-light pages, **the gap between "fast
TTFB" and "slow FCP" is where the real problem lives** — that's render-path
and hydration territory, not server response time.

Full inventory of custom code that runs on every/most requests, for a
by-elimination audit (temporarily disable one at a time against a real
deploy, measure via PSI, re-enable, repeat — don't guess):

**`server/middleware/`** (runs on every request in listed order):
- `00.edge-cache.ts` — HTML KV cache read (short-circuits SSR on hit, keep)
- `00.r2-media.ts` — R2 media proxy (only fires for `media.krabiclaw.com` host)
- `db-foreign-keys.ts` — `PRAGMA foreign_keys = ON` per request (now guarded
  against self-fetches, still runs on every real request)
- `tenant-resolution.ts` — tenant/host resolution + D1 lookup, ~12.6KB file,
  the single largest/most complex middleware, runs on every request
- `tenant-routing.ts` — redirect/404 logic for tenant routing
- `zz-pageview-tracking.ts` — analytics D1 insert (async via `waitUntil`,
  shouldn't block response, but worth confirming)
- `zz-platform-plans-prefetch.ts` — new this session, only fires for
  platform `/` — low risk, narrow scope
- `zz-redirects.ts` — canonical domain / redirect logic

**`server/plugins/`**:
- `edge-cache.ts` — HTML KV cache write (afterResponse hook)
- `bootstrap-cache-invalidate.ts` — cache purge on mutations
- `error-logger.ts`, `runtime-config-validation.ts` — small, unlikely culprits

**`nuxt.config.ts`** — worth a hard look at whether every module/config
block is pulling its weight:
- `modules`: `nitro-cloudflare-dev`, `@nuxt/scripts`, `@nuxtjs/robots`,
  `@nuxtjs/sitemap`, `nuxt-schema-org`, `@nuxtjs/i18n`, `@nuxt/ui`,
  `@nuxt/image`, `@nuxt/fonts` — `@nuxt/image` in particular: confirmed
  earlier this session there's no explicit `image:` provider config, meaning
  it's likely not actually doing anything useful for the `imagedelivery.net`
  URLs used throughout (they bypass it entirely via raw `<img>` tags) — dead
  weight in the bundle if so, worth confirming and possibly removing.
- `routeRules` — multiple wildcard header rules (`/**` catch-all,
  `/mcp-assets/**` with wildcard CORS, etc.) — each route rule is matched
  per-request; unlikely to be expensive but not yet ruled out.
- `nitro.experimental.tasks`, `nitro.cloudflareDev` — custom Nitro-level
  config, worth confirming these don't add per-request overhead beyond
  their documented cold-start/dev-only purpose.

**Not yet investigated at all this session** (real candidates, deferred
earlier as "Phase 3 — hydration weight"): 3.4MB JS across 262 chunks (largest
chunk 502KB), full component auto-discovery registering
platform+dashboard+editor+saya+ui namespaces even on tenant-only pages
(`nuxt.config.ts` component paths), minimal lazy-hydration (`layouts/saya.vue`
only lazy-loads Footer/UpgradeModal). This was explicitly punted on earlier
today as "too big for this PR" — given the new evidence (content-light pages
also slow), **this is probably no longer optional to investigate, it may be
the actual answer.**

## Concrete suggested approach

1. Don't add anything else. Don't touch images again.
2. Pick one custom middleware/plugin/module at a time, disable it (or a
   minimal stock-Nuxt-on-Cloudflare-Workers reference deploy, if one can be
   stood up cheaply), deploy to a scratch environment, and get a **real PSI
   number** (not local Lighthouse) before/after. Isolate whether removing
   any single piece meaningfully moves FCP/LCP on `krabiclaw.com/features`
   (all-text, so image/hydration-content confounds are minimized).
3. If nothing in the custom middleware/plugin layer explains it, the
   remaining hypothesis is genuinely the Nuxt/Vue hydration + Cloudflare
   Workers cold-start combination itself — at which point the fix is
   architectural (component islands, lazy hydration, possibly reconsidering
   SSR-on-Workers for content-heavy marketing pages) rather than a bug to
   patch.
4. Whatever is found, update this document (or its successor) with the
   verified before/after PSI numbers — screenshots or the actual report URL,
   not local Lighthouse output — before calling anything fixed.

## Uncommitted local state as of this handoff

- `nuxt.config.ts` — corrected preconnect hint (item #5 above), built, not
  deployed, not committed.
- `package.json` / `yarn.lock` — `lighthouse` added as devDependency,
  `perf:lighthouse` script added.
- `scripts/lighthouse-check.mjs` — new, uncommitted, untested in CI.
- `.github/workflows/ci.yml` — has an **unrelated pre-existing broken-YAML
  edit** (` didn't   perf-benchmark:` instead of `  perf-benchmark:`) that
  predates this session's page-speed work — do not commit this file as-is,
  it will break CI parsing.
