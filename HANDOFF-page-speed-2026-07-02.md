# Handoff: KrabiClaw page speed — stop adding, start removing

## Latest update (2026-07-03, preview shell comparison): public shell cleanup materially helped

Fresh preview Lighthouse runs against the perf harness now show that removing
Nuxt UI from the public platform/Saya surfaces materially improved the public
shell modes versus the July 2 production snapshot.

| Mode | LCP | FCP | TTI | Transfer |
| --- | ---: | ---: | ---: | ---: |
| `text-no-icons` | 1.49s | 1.49s | 3.02s | 339.3KB |
| `platform-shell` | 2.83s | 2.53s | 2.96s | 380.3KB |
| `saya-header` | 1.60s | 1.60s | 2.40s | 347.6KB |
| `saya-footer` | 1.44s | 1.44s | 2.40s | 354.1KB |
| `saya-shell` | 2.24s | 2.24s | 2.78s | 356.6KB |

Compared with the July 2 production snapshot:

- `text-no-icons` transfer dropped from `518.6KB` to `339.3KB`, and TTI dropped
  from `4.86s` to `3.02s`.
- `platform-shell` transfer dropped from `543.3KB` to `380.3KB`, and TTI dropped
  from `5.91s` to `2.96s`.
- `saya-shell` improved the most visibly: transfer dropped from `597.3KB` to
  `356.6KB`, LCP dropped from `3.00s` to `2.24s`, and TTI dropped from `5.97s`
  to `2.78s`.

Interpretation:

- Yes, removing Nuxt UI from public platform/Saya materially helped.
- The biggest remaining floor is now the shared Nuxt client entry chunk
  (`~132KB` transferred on preview), which is present across all modes.
- A follow-up split landed locally after this preview read: `pages/dev/perf-text.vue`
  is now just a small shell that async-loads `PerfTextMode*` child chunks per
  mode. In the local build, the base perf route server chunk is about `9.0KB`,
  while mode-specific chunks like `PerfTextModePlatformShell` and
  `PerfTextModeSayaShell` are separate `~2.8KB` and `~3.4KB` files. That means
  the next trustworthy measurement should come from a fresh preview deploy of
  the perf page, not from the old all-modes-in-one route structure.

## Latest update (2026-07-03, later): root `UApp` split landed locally, workspace ownership localized, preview is the next trustworthy perf read

Use this section first — it supersedes everything below.

### What changed locally

The big public-vs-workspace boundary refactor is now in this branch:

- `app.vue` no longer wraps the whole app in root `<UApp>`.
- `layouts/dashboard.vue` and `layouts/editor.vue` now own `UApp`.
- `layouts/platform.vue`, `layouts/saya.vue`, `layouts/blog.vue`, and
  `layouts/docs.vue` remain public-surface wrappers without `UApp`.
- The clearly workspace-only component families moved under
  `components/workspace/{dashboard,editor,media,onboarding}` and
  `nuxt.config.ts` component registration was updated to match.
- Public/auth holdouts that were still pinning Nuxt UI into the public surface
  were converted off it: `error.vue`, `pages/oauth/consent.vue`,
  `pages/accept-invitation/[invitationId].vue`, and `pages/transfer/[token].vue`.
- Public billing was also converted off Nuxt UI in parallel in this branch,
  so `pages/billing.vue` no longer forces `layouts/default.vue` to keep `UApp`.

### Verification status

**Green locally:**

- `yarn typecheck` passes.
- `yarn build` passes.
- Local dev-app smoke checks pass after `GET /api/dev/login`:
  - `/dashboard/pottery-house-krabi/sites/pottery-house/krabi/content`
  - `/dashboard/pottery-house-krabi/sites/pottery-house/krabi/photos`
  - `/dashboard/pottery-house-krabi/sites/pottery-house/krabi/media`

Those three are the important confirmation that the moved
`components/workspace/editor` and `components/workspace/media` trees still
render correctly under the new ownership split, not just the dashboard chrome.

**Important caveat on local built-app verification:**

Serving the production build locally via
`npx wrangler dev .output/server/index.mjs --assets .output/public --local`
returns the SSR HTML correctly, but in this environment `wrangler dev` then
404s hashed `/_nuxt/*` asset requests (JS/CSS) for the built app. Because of
that, local built-browser hydration/perf numbers from this path are **not**
trustworthy right now. The SSR routes themselves loaded and the public/auth page
HTML looked correct, but the asset-serving layer is flaky.

**Consequence:** the next trustworthy read on bundle/hydration/perf should come
from the PR preview deployment (`preview.krabiclaw.com`), not from local
`wrangler dev` on the built artifact.

### Current bundle read

We do have one useful production-build artifact signal from disk:

- Largest JS chunk in `.output/public/_nuxt`: about **368KB raw / 132KB gzip**

This is materially below the earlier handoff's ~176KB-gzip public entry-floor
number, so the surface split appears to have moved the client bundle in the
right direction. Treat that as a promising artifact-level signal, not the final
perf verdict — preview still needs to validate what the browser actually loads.

### Next concrete step

Open the PR, let `e2e-smoke` deploy preview, and then re-run the
`/dev/perf-text?mode=text-no-icons` comparison against preview so the built app
is being served through a trustworthy asset path. If preview confirms the public
entry floor dropped in real browser terms, then the next iteration is to attack
whatever remains at the top of `.output/public/_nuxt` with a more precise
bundle breakdown.

### GA4 idle-callback fix — done, verified, not yet deployed

`app.vue` no longer uses `requestIdleCallback` for GA4. It now loads only on
first interaction (click/scroll/keydown) or a fixed 15s passive-visit
fallback that can't preempt Lighthouse's TTI quiet-window. Re-ran the same
interleaved-8-round methodology from the previous session against two fresh
local production builds (`.output-ga4-on/`, `.output-ga4-off/`, rebuilt with
the fix): **GA4-on TTI median 2.96s vs GA4-off 2.94s — gap closed** (was
4.51s vs 2.98s, an ~1.5s regression, before the fix). Round-by-round: 6/8
off-faster, 2/8 on-faster — noise, no consistent direction either way. This
branch (`docs-blog-nav-speedups`) has the change uncommitted; needs its own
commit separate from the unrelated blog/docs nav work already on the branch.

### Important methodology correction: local `simulate` "seconds" are a byte-weight model, not elapsed time

Pulled the raw Lighthouse JSON's `metrics` and `diagnostics` audits directly
(`/tmp/lh-ga4fix-off-8.json`) instead of just reading the summary numbers.
On loopback (`127.0.0.1`, effectively 0 RTT), the **observed** (real,
unthrottled) trace shows FCP/LCP at 259ms and full load at 262ms — this
sandbox's `/dev/perf-text?mode=text-no-icons` genuinely paints and loads in
under 300ms. The **reported** 2.4s FCP / 3.1s TTI is `--throttling-method=simulate`
applying Lighthouse's fixed mobile-network model (bandwidth + RTT budget) on
top of the page's request graph — it is a deterministic function of
*how many bytes have to move* before the model says the network is "quiet
enough," not a measurement of anything that actually took that long here.

**Consequence for "get local down to 1s": under `simulate`, that number moves
almost entirely by cutting transferred JS/CSS bytes on the critical path, not
by finding real added latency** — there isn't hidden latency to find in this
environment; there's payload weight the simulated model is pricing at mobile-3G
rates. (This doesn't contradict the GA4 finding above — GA4 added a real
extra request that the quiet-window has to wait out; that's a legitimate
timing effect. The remaining gap below plain-text baseline is bytes, not a
late-firing request.)

### Confirmed next lever: the global entry chunk ships ~176KB (gzip) of JS to a page with zero interactive content, 44% of it unused on that page

`diagnostics` audit on `/dev/perf-text?mode=text-no-icons`: 20 requests,
333KB total byte weight, 9 scripts. The dominant one is a single global entry
chunk, `_nuxt/D0ZO8y0T.js` (513KB raw / 176KB gzip transferred) — Lighthouse's
`unused-javascript` audit flags **77.7KB (44%) of its transferred bytes as
unused on this page**. `strings` on the raw chunk confirms it bundles, among
other things, the **full Nuxt UI locale message tree** (`calendar`,
`carousel`, `commandPalette`, `modal`, `slideover`, `toast`,
`dashboardSearch`, `dashboardSidebarCollapse`, ...) and the full `vue-i18n`
runtime — none of which this page renders. `@nuxt/ui`'s own `locale/en.js`
source file is only 3.2KB, so the locale strings aren't the bulk of the
513KB by themselves; the bigger contributors are Vue's runtime + `vue-i18n`
+ Nuxt UI's component runtime.

**Note:** The root `UApp`/`UOverlayProvider` wrapper in `app.vue` has been
removed as part of the public-vs-workspace boundary refactor. `UApp` is now
owned by `layouts/dashboard.vue` and `layouts/editor.vue` only. The remaining
Nuxt UI holdouts on public/auth surfaces are:
- `error.vue`
- `pages/index.vue`
- `pages/auth/invite/[token].vue`

This matches, and confirms, the "not yet investigated" hypothesis flagged at
the end of the previous handoff section (3.4MB JS / 262 chunks, component
auto-discovery across 11 namespaces registered globally even on tenant-only
pages) — this is very likely now the actual answer, not a bug to patch
elsewhere. CSS remains a secondary lever (`entry.DjdkKqO3.css`, 43KB gzip)
but was already measured earlier in this doc at only ~160ms of LCP impact —
don't re-chase it before the JS entry chunk.

**Not yet done — next concrete step for whoever picks this up:** get a
per-module breakdown of the current entry chunk (source-map-explorer or
`rollup-plugin-visualizer` against a real build, not `strings` guessing) to
confirm the actual byte split between Vue core / vue-i18n / Nuxt UI
components / Reka UI primitives, then split or lazy-load whatever isn't
needed on the initial paint of a content-only page (most likely candidates:
defer `vue-i18n`'s full runtime until a non-default locale is actually
selected, and/or stop eagerly registering component namespaces —
`dashboard`, `editor`, `billing`, `onboarding`, `docs`, `blog`,
`menu`, `media` — that a plain marketing/tenant page will never render).
Re-verify with the same interleaved-A/B + raw-JSON-`diagnostics` method
above (not just the summary TTI number) once a change lands, since the
summary number is a `simulate`-model artifact and the `diagnostics`/
`unused-javascript` byte counts are the ground truth for this environment.

### Current repo state after the public-layout sweep

The broad public-surface Nuxt UI removal work is also already in this branch:
`layouts/platform.vue`, `layouts/saya.vue`, `layouts/blog.vue`, and
`layouts/docs.vue` no longer use `UTheme`, and most public/auth pages were
converted to local platform/Saya primitives. `yarn typecheck` is clean on the
combined branch state.

What still remains outside dashboard/editor/admin surfaces is now much smaller
and more targeted:

- `app.vue` still wraps the whole app in root `<UApp>`. This is the most likely
  reason the shared public entry chunk still eagerly pulls Nuxt UI runtime /
  overlays / locale plumbing.
- `error.vue` still uses `<UApp>` and `<UButton>`.
- `pages/index.vue` still has a platform-only modal/card/icon cluster
  (`UModal`, `UCard`, `UIcon`).
- `pages/accept-invitation/[invitationId].vue`,
  `pages/transfer/[token].vue`, and `pages/oauth/consent.vue` still use Nuxt UI,
  but they're low-traffic auth/invite flows, not part of the always-rendered
  marketing/tenant shell.
- `components/ui/AppToast.vue` still exists, but all remaining callers are
  dashboard/onboarding/editor-side. It is not currently used by the public
  route tree.
- `components/ui/UImage.vue` is a local wrapper, not a real remaining Nuxt UI
  dependency; grep hits on `UImage` in `components/menu/MenuItemCard.vue` and
  `pages/locations/[slug]/photos.vue` are false positives through that wrapper.
- `components/saya/_ignored/SayaUpgradeModal.vue` is intentionally parked out of
  the active tree.

That means the next performance experiment should focus on whether moving
`UApp` out of root `app.vue` and into only the layouts that truly need Nuxt UI
actually splits the shared entry chunk. A template `v-if` around `<UApp>` in
`app.vue` is not enough — if the SFC still imports it there, it stays in the
shared chunk.

---

## Previous update (2026-07-02, later session): Saya shipped, real ~1.5s TTI lever found — GA4 idle-callback, not yet fixed

Use this section second — it supersedes "public perf page is live, next target is
Saya shell" below (kept as historical context; its "GA4 is not the issue"
conclusion in that section's line 42-44 was wrong for TTI specifically, see below).

### What shipped (merged to `main`, deployed, CI green)

`SayaHeader.vue`/`SayaFooter.vue` had `UButton`/`UIcon`/`UDropdownMenu` replaced
with native elements + inline SVG + a new headless `components/saya/SayaDropdown.vue`
(keyboard nav, click-outside, Escape, focus-restore-to-trigger, close-on-tab-away).
Bootstrap cache invalidation gap also fixed (`purgeBootstrapCacheSafe()` added to
~11 call sites — location CRUD, onboarding, Google Business/Places sync — that
weren't purging before), and TTL raised 60s → 300s now that the gap is closed.
Self-fetch elimination in `useBootstrap.ts` was **attempted and reverted** — Nuxt
hard-blocks importing `server/**` into composables at build time, even
dynamically, specifically to keep server-only code (D1/KV/H3) out of the client
bundle. A real fix would need bootstrap-building moved into `server/middleware`
(populate `event.context` before SSR starts) — bigger, not attempted.

**Confirmed, deterministic win:** transfer bytes dropped ~60KB per Saya page load
(`saya-header` 590.5KB→529.4KB, `saya-footer` 593.7KB→534.4KB, `saya-shell`
597.6KB→537.9KB), matching ~15 fewer modulepreloads almost exactly. This is a
byte count, not a timing measurement — not subject to network noise, trust it.

**Timing metrics (LCP/FCP/TTI) from the Saya change: inconclusive, and that's
a real methodology lesson, not just this-one-case noise.** Initial
non-interleaved before/after runs (run all of mode A, then all of mode B,
minutes apart) suggested `saya-header` TTI regressed. A proper interleaved A/B
(alternate A/B/A/B each round, `--throttling-method=provided` = real observed
conditions, no simulated network model on top of real noise) showed **no
consistent direction** — it flipped both ways round to round, and re-running
the *unchanged* baseline alone twice produced a ~0.9s swing on its own.
**Lesson for next time: always interleave A/B rounds, never run one condition's
whole batch then the other's — session-level drift will masquerade as a code
difference.** `scripts/lighthouse-check.mjs` (`yarn perf:lighthouse`) does NOT
interleave by default; for real A/B comparisons write a throwaway script that
alternates (see preserved artifacts below for the template already written).

### The real finding: GA4 idle-callback costs ~1.5s of TTI, platform-wide, not yet fixed

`app.vue:89-101` defers Google Analytics via
`requestIdleCallback(loadGa4, { timeout: 8000 })`, with a comment claiming this
"protects Lighthouse TTI." **It does the opposite.** `requestIdleCallback` fires
as soon as the main thread goes idle — on a content-light page that's almost
immediately, injecting a 166KB `gtag.js` fetch right into the window Lighthouse
needs quiet (no long tasks, ≤2 in-flight requests, 5s window) to mark the page
interactive. Confirmed via network trace: on `/dev/perf-text?mode=text-no-icons`,
`gtag.js` doesn't start downloading until ~5.6s in and finishes ~7.4s — directly
explaining why TTI kept landing at 4.7-5.9s on a page with almost nothing on it.

**This has nothing to do with Saya.** It's in `app.vue`, loads on every
platform page (and every tenant page with a connected GA4 — see CLAUDE.md
Analytics section), and was present identically before and after all of
today's Saya work. It predates this session; a prior investigation already
flagged GA4 as "network/TTI weight" (see historical section below, line 42-44)
but incorrectly concluded not to prioritize it, because that note was about
LCP specifically — GA4 is confirmed not an LCP blocker, but it IS the dominant
TTI lever, and TTI is what's been reading as "the page is slow" this whole time.

**Independently reproduced twice, with increasing rigor:**

1. First pass reused an old one-off test already sitting in
   `test-results/lighthouse-no-ga4` vs `test-results/lighthouse-ga4-deferred`
   (not interleaved, against `127.0.0.1`): 3.0s TTI (no GA4) vs 5.8s TTI
   (current strategy) — a 2.8s gap, but not interleaved so treat the magnitude
   loosely.
2. **Second pass — interleaved, 8 rounds, two real local production builds**
   (`.output-ga4-on/` = default, `.output-ga4-off/` = built with
   `PERF_NO_GA4=true`, served via two separate local `wrangler dev` instances
   on ports 8788/8789, `--throttling-method=simulate` to match how the
   original prod numbers in this doc were measured): **GA4-on TTI median
   4.51s vs GA4-off TTI median 2.98s — GA4 slower in 8/8 rounds, no
   exceptions, no direction flips.** This is the trustworthy number. Delta
   ≈ **1.5s**, not the 2.8s from the older non-interleaved test — direction
   and reality of the effect holds, exact magnitude is closer to 1.5s.

Note on methodology: reproducing this on real `localhost` (loopback, near-zero
latency) with `--throttling-method=provided` (real conditions, no simulation)
shows almost no difference — because loopback has no real network cost for
either `krabiclaw.com` or the third-party `googletagmanager.com` domain to
expose. The effect only shows up either (a) against the real production URL
over real WAN, or (b) locally under Lighthouse's `simulate` throttling method,
which extrapolates network cost from payload size regardless of actual
transport speed. Use `simulate` (not `provided`) for any local GA4 experiment.

### Next concrete step

Fix the GA4 loading strategy in `app.vue`. The `requestIdleCallback` approach
is the anti-pattern — it's supposed to be a lazy/deferred load but self-defeats
by firing early on quiet pages. Options to consider, not yet evaluated:
- Load on a real interaction-only basis (the existing `loadOnInteraction`
  click/scroll/keydown listeners already exist as a fallback path in the same
  file — consider making that the *only* trigger, dropping the idle-callback
  path entirely, so GA4 never loads until a real user actually does something).
- If some passive collection is required even with zero interaction, use a
  fixed `setTimeout` well past Lighthouse's TTI window (e.g. 10-15s) instead of
  `requestIdleCallback`, so it can't preempt the quiet-window measurement.
- Whatever the fix, **re-run the same interleaved-8-round GA4-on/off
  methodology above** (not a single before/after) to confirm before calling
  it done — a non-interleaved before/after here would repeat the exact mistake
  made on the Saya TTI numbers above.

### Historical local artifacts from the GA4 A/B (results still useful, builds already cleaned up)

- `test-results/lighthouse-prod-saya-isolation-after/` — post-merge Saya
  isolation numbers (non-interleaved, simulated throttling, all 5 modes).
- `test-results/lighthouse-prod-saya-isolation-recheck/` — 5-run recheck of
  `text-no-icons`/`saya-header` that exposed the non-interleaved noise problem.
- `.output-ga4-on/` and `.output-ga4-off/` were used for the local interleaved
  GA4 verification, but were intentionally deleted afterward as scratch build
  outputs. Rebuild them if this exact A/B needs to be rerun.
- `/tmp/lh-interleaved-results.json` — raw 8-round Saya header-vs-baseline A/B.
- `/tmp/lh-ga4ab-results.json` — raw 8-round GA4 on-vs-off A/B (the numbers above).
- Scratchpad scripts (interleaved A/B runner templates, reusable for the next
  GA4-fix verification): ask this session's transcript or regenerate from the
  pattern described above — alternate conditions per round, write to
  `/tmp/lh-<label>-<round>.json`, median across each label's rows.

---

## Latest update: public perf page is live, next target is Saya shell

Use this section first. The older sections below are historical context from
earlier page-speed work and are useful, but they predate the dedicated
`/dev/perf-text` methodology and the latest production measurements.

The user wants methodical benchmarking and direction for larger changes, not
speculative implementation. Keep using the test page to isolate one global layer
at a time before moving to real tenant pages.

Public test routes are currently available on production while
`PERF_PUBLIC_TEST_PAGE` is not set to `false`:

- `https://krabiclaw.com/__dev-perf/plain-text`
- `https://krabiclaw.com/dev/perf-text?mode=text-no-icons`
- `https://krabiclaw.com/dev/perf-text?mode=<mode>`

They are restricted to owned KrabiClaw hosts and emit `noindex,nofollow`. Disable
them after testing with `PERF_PUBLIC_TEST_PAGE=false`.

Production snapshot from July 2, 2026:

| Route / mode | LCP | FCP | TTI | TTFB | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/__dev-perf/plain-text` | 0.81s | 0.81s | 0.81s | 0.54s | 20.9KB |
| `/dev/perf-text?mode=text-no-icons` | 1.37s | 1.37s | 4.86s | 0.60s | 518.6KB |
| `/dev/perf-text?mode=text-with-one-icon` | 1.58s | 1.50s | 4.84s | n/a | 519.0KB |
| `/dev/perf-text?mode=text-with-ui-button` | 1.54s | 1.54s | 5.72s | n/a | 518.7KB |
| `/dev/perf-text?mode=platform-shell` | 1.43s | 1.36s | 5.91s | 1.04s | 543.3KB |
| `/dev/perf-text?mode=saya-shell` | 3.00s | 2.93s | 5.97s | n/a | 597.3KB |

What this means:

- Raw Worker/Nitro is healthy enough that it is not the current global blocker.
- The icon fix worked; a single icon no longer reproduces the old 1.5s timeout.
- A single Nuxt UI button is not the 1s+ problem.
- Tailwind/global CSS is very large, but the measured LCP gain from stripping it
  locally was only about 160ms. It is worth budgeting later, not the next
  1.5s-class lever.
- GA4 and DOMPurify are not current LCP blockers on the text page. GA4 is
  network/TTI weight, so delaying it is reasonable, but do not keep treating it
  as the main LCP issue.
- The next concrete test is Saya shell isolation. Add/measure modes:
  `saya-header`, `saya-footer`, and `saya-static-shell`.

For the next session, start here:

```bash
yarn perf:lighthouse --url 'https://krabiclaw.com/dev/perf-text?mode=text-no-icons' --runs 3 --form-factor mobile --output-dir test-results/lighthouse-prod-text
yarn perf:lighthouse --url 'https://krabiclaw.com/dev/perf-text?mode=saya-shell' --runs 3 --form-factor mobile --output-dir test-results/lighthouse-prod-saya-shell
```

Then add the three Saya isolation modes to `/dev/perf-text` and measure those
same way. Also inspect emitted HTML for modulepreloads, stylesheet count, scripts,
and top resources before recommending an architectural change.

After the Saya shell is isolated, use the attached tenant HAR/Pingdom evidence as
the next queue:

1. Verify real public tenant HTML edge caching by `host + path + locale`, not
   just cache headers. Bypass dashboard/admin/api/auth/preview/draft/edit.
2. Verify whether tenant SSR still self-fetches bootstrap through
   `useBootstrap` -> `/api/public/sites/:siteId/bootstrap`; if yes, move the
   build/query logic into a shared server function and call it directly.
3. Increase public bootstrap TTL to 300-900s only with purge on content/menu/site
   media mutations.
4. Stop duplicate Cloudflare Image variants where the same asset loads as both a
   sized variant and `/public`.
5. Investigate public tenant JS splitting. The HAR had about 513KB uncompressed /
   175KB transferred JS.
6. Investigate CSS splitting. The HAR had about 303KB uncompressed global CSS.
7. Lazy-load below-fold recent post media in `pages/index.vue`.
8. Add budgets for TTFB, JS transfer, CSS transfer, image bytes, and duplicate
   image URLs. HAR baseline: about 5.5s fully loaded, 978KB transferred, 175KB
   JS, 41KB CSS, and 682KB images.

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
