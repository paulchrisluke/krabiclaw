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
  enter through their owning layouts or route components. Public surface layouts
  import their entry CSS as a URL and emit an SSR `<link rel="stylesheet">`;
  this keeps the CSS split by surface without waiting for the layout client
  chunk to hydrate.
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

The public surfaces also had a concrete first-paint bug: their layouts imported
entry CSS as a client-side module side effect. SSR could therefore deliver the
complete HTML without a surface stylesheet in the document head. The browser
painted default fonts, colors, and layout until hydration loaded the layout
chunk. Platform, Saya, and Blawby now import their entry CSS as `?url` and add
the URL through `useHead`, so SSR emits the stylesheet link while the CSS stays
surface-scoped. A Vite output plugin rewrites those three CSS assets to the
stable paths `/_nuxt/surfaces/platform.css`, `/_nuxt/surfaces/saya.css`, and
`/_nuxt/surfaces/blawby.css` in both the client output and server references.
This prevents independent client/server asset hashing from producing an SSR
stylesheet URL that the deployment does not contain. Those stable files are
served with revalidation rather than immutable caching. The layouts normalize
the imported URL to that root-relative path so SSR and hydration produce one
canonical `<link>` value instead of relative and absolute duplicates.
Dashboard/editor CSS remains outside these public entrypoints.

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

The live production trace reproduced the failure: SSR HTML arrived first with
only the entry stylesheet, while the surface stylesheet appeared later when the
layout client chunk loaded. The resulting screenshot showed the raw browser
layout before the finished platform, Saya, or Blawby surface.

The corrected production-style local Worker now puts the stable surface
stylesheet link in the initial SSR head. Fresh browser checks showed the
platform, Saya, and Blawby links and styled shells at the first sampled
milestone; later hydration added only route/component CSS. The strict preview
asset waiter also remains in place so a deployment fails when HTML references
an unavailable asset. This fix removes the white/default-style phase locally,
but it does not by itself certify the remote Lighthouse result. The deployed
Worker and real custom-domain image origin still need the same cold check after
release.

The production gate remains cold browser navigation, request budgets, query
budgets, payload size, and visible error propagation—not an arbitrary warm-cache
number.

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
