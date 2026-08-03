# Performance recovery — August 2026

## Decision

The application remains one Nuxt app and one Worker. Vue file placement does not
create bundle boundaries by itself; route chunks are already split by Nuxt. The
boundaries that matter here are imports, layouts, CSS entrypoints, and server
work performed on the critical path.

The governing request invariant is:

> One logical resource load → one canonical request/service call → one bounded
> attempt → success or a useful error.

Failed or malformed API data is not converted into an empty success state. There
are no stale, static, alternate-endpoint, self-fetch, or demo-content fallbacks.
User-triggered Retry controls remain explicit retries.

## What was causing the slow pages

The 5–6 second experience was the result of stacked work, not one slow Vue file:

- platform middleware fetched billing plans before the homepage needed them;
- dashboard layout mounting fetched onboarding data for pages that did not render
  onboarding;
- fallback chains could turn one logical load into several calls;
- public routes inherited dashboard/editor CSS and globally registered feature code;
- public and dashboard surfaces shared global CSS and root-level client plugins;
- `app.vue` and `pages/about.vue` still loaded the generic Saya/site shell on
  Blawby routes even though Blawby has its own route and shell services;
- SSR paths still had to be kept off internal HTTP self-fetches because nested
  Nitro dispatch does not carry the Worker bindings reliably.

The cleanup removes those calls and coupling points. Pricing owns its single
canonical plans load. The homepage makes no plans request. Dashboard home does
not load the onboarding checklist. Failed API responses remain typed errors with
an error code and request ID.

Dashboard support follows the same boundary: its SSR page reuses the context
already loaded by the dashboard layout and calls one bounded work-request
service. The API route and page share that service, so the list cannot drift
into a second context lookup or an unbounded query. Location settings no longer
silently fetches billing plans to decide whether to show an automatic upsell;
billing remains an explicit user action on billing surfaces.
Dashboard route capability checks now surface authentication, database, and
malformed-response errors instead of converting failed guard requests into
false capabilities or misleading 404s. Free-plan support pages do not query
work-request history because that surface is not rendered for free plans;
paid-plan history still has one bounded load.

## Client boundary decisions

- Public home, Saya, Blawby, platform marketing, help, and dashboard/editor CSS
  enter through their owning layouts or route components.
- Dashboard/editor code is not globally imported merely for component
  registration.
- Nuxt UI color-mode runtime is disabled. Platform theme preference is managed
  by `usePlatformTheme`, which owns the `html.dark` class and persists the
  explicit `system`, `light`, or `dark` preference. Saya uses its existing theme
  class contract. Blawby is intentionally light-only.
- Blawby routes bypass the generic root site-shell state and generic public-page
  data loader. They use the canonical Blawby route and shell services only.
- Fonts are self-hosted by `@nuxt/fonts`; no runtime plugin adds a Google Fonts
  stylesheet. Blawby keeps its gold/accent page bands and uses Poppins for body
  text and Marcellus for display text.
- The public platform header uses static Login and Start Free links. It does not
  resolve a session or import dashboard auth code on every public navigation.
- Vite `build.modulePreload` is disabled for this app. This removes the broad
  manifest-wide preload fan-out that made a public browser navigation fetch
  dozens of unrelated route chunks before the hero could paint. Route chunks
  still load when their route or component is actually entered; dashboard,
  admin, and auth code remains out of public layout and CSS entrypoints.
- Saya home pages preload the actual server-rendered hero image, select its
  responsive Cloudflare Images variant, and lazy-load location, post, blog, and
  footer images below the hero. The first location image is no longer marked
  eager/high-priority beside the LCP image.
- Post videos remain poster-only until their card enters a 200px viewport
  margin; autoplay is mounted only after that visibility gate opens.
- The Google Business photo contract is `google_url`. Reading it with the old
  camel-case name left tenants without CMS hero media with an empty hero image;
  the home hero now uses the canonical response field.

Blawby also had a concrete first-paint bug: its layout manually injected a
hashed CSS URL that could differ between the server manifest and the client
manifest. That produced a stylesheet 404 and a flash of unstyled or inverted
text before the correct CSS arrived. The layout now imports the CSS normally so
Nuxt emits one route-owned stylesheet reference.

## Cold-path measurements from the production-style local Worker

The acceptance check uses a fresh local origin for each browser navigation and
does not count a warm cache hit. The Worker was rebuilt with the public CSS
entrypoints and `modulePreload: false`, then served on isolated ports. The
browser saw zero modulepreload links and loaded the surface fonts before the
check completed:

| Surface and route | First browser navigation |
| --- | ---: |
| Platform `/` | 326 ms |
| Saya `/preview/site/site-demo/` | 226 ms |
| Blawby `/preview/site/site-ncls-blawby/about` | 235 ms |

These are smoke observations, not a statistically meaningful benchmark, but
they are cold-origin measurements rather than warm-cache claims. The server
responses also stayed bounded on the same Worker: platform HTML returned in
71 ms, Saya home in 66 ms, and Blawby About in 60 ms. The direct responses
reported `x-data-cache: BYPASS`; the cold checks therefore exercised the
canonical D1-backed loaders rather than a warm public-resource cache. D1 query
counts were 1 for platform HTML, 2 for Saya home, and 2 for Blawby About.

The important split is now explicit: cache hits are a warm optimization; they
cannot prove the `<1s` cold target. Every cold check must exercise the canonical
source loader, record request/query counts, and surface source errors.

## Browser trace follow-up

The earlier 4–6 second browser traces were reproducible before the client
boundary change. They included the public route's own work plus a manifest-wide
modulepreload fan-out. A fresh browser origin after the change no longer
requested those unrelated chunks, and representative Platform, Saya, and
Blawby routes completed below one second locally with the correct fonts and
surface CSS. The Blawby screenshot also verified the intended navy/gold bands
and readable body/display text.

This does not by itself certify remote Lighthouse: the deployed Worker and
real custom-domain image origin still need the same cold check. The production
gate remains cold browser navigation, request budgets, query budgets, payload
size, and visible error propagation—not an arbitrary warm-cache number.

## Validation contract

Use the production-style Worker and browser for representative smoke checks:

- homepage: zero billing-plan requests;
- pricing: exactly one canonical plans request;
- dashboard home: zero onboarding-checklist requests;
- failed API data: visible actionable error, never an empty success state;
- no duplicate logical resource requests;
- no `ERR_HTTP_HEADERS_SENT` messages;
- public pages do not preload dashboard/editor-only CSS or chunks.
- dashboard support does not perform a second context load or an unbounded
  work-request query during SSR.
- dashboard capability failures remain actionable errors rather than false
  capability responses or fallback 404s.

Preview browser checks wait for the deployed entry stylesheet, every HTML-referenced
Nuxt asset, and the HTML's build metadata to be available before running. A Worker
deployment is not considered browser-ready while HTML can reference an asset or
build manifest that still returns 404.

Keep shared transport/error/request-budget tests at the invariant level. Do not
add one page test per duplicate request or another benchmark suite that merely
repeats the same contract.
