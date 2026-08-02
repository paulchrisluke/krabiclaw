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
- Public HTML removes Nuxt's broad `modulepreload` hints. The renderer emits a
  hint for every client manifest entry, which made mobile browsers fetch dozens
  of route chunks before the public hero could paint. Public scripts remain
  available through their normal entry tags; dashboard, admin, and auth routes
  retain their private-surface hints.
- Saya home pages preload the actual server-rendered hero image, select its
  responsive Cloudflare Images variant, and lazy-load location, post, blog, and
  footer images below the hero. The first location image is no longer marked
  eager/high-priority beside the LCP image.
- The Google Business photo contract is `google_url`. Reading it with the old
  camel-case name left tenants without CMS hero media with an empty hero image;
  the home hero now uses the canonical response field.

Blawby also had a concrete first-paint bug: its layout manually injected a
hashed CSS URL that could differ between the server manifest and the client
manifest. That produced a stylesheet 404 and a flash of unstyled or inverted
text before the correct CSS arrived. The layout now imports the CSS normally so
Nuxt emits one route-owned stylesheet reference.

## Measurements from the production-style local Worker

After the CSS, public-header, and lazy-boundary fixes, a smoke pass against the
rebuilt Worker observed these server-side response times:

| Route | Direct local Worker response |
| --- | ---: |
| `/` | 258 ms |
| `/pricing` | 216 ms |
| `/preview/site/site-ncls-blawby/about` | 653 ms HTTP / 588 ms instrumented |
| `/dashboard/pottery-house-krabi` | 999 ms |

These are direct HTTP measurements after the production-style Worker was
warmed. The in-app browser rendered the Blawby About page with its Poppins body
font, Marcellus display font, navy text, and three gold bands. Its full `goto`
waits were higher, and one first navigation timed out, because this Wrangler
preview served hashed assets through the in-app browser's remote transport; the
Worker's own route instrumentation remained separate from that transport. The
universal client entry is 394.49 KB raw / 139.10 KB gzip. The 517.30 KB raw /
161 KB gzip editor chunk is route-only and is not loaded by the public homepage.

These are smoke observations, not a statistically meaningful benchmark. The
blocking checks are request count, query count, payload size, own-origin SSR
requests, and error propagation. Comparative wall-clock benchmarking belongs in
the final merge-ready lane, not in every editing loop.

## Browser trace follow-up

The first live browser check after the dashboard release still reproduced the
reported public delay: the platform homepage completed a cold browser
navigation in about 4.0 seconds, and the non-canonical Pottery House hostname
took about 5.7 seconds including its redirect. A direct warm navigation to
`www.potteryhousekrabi.com` was about 1.9 seconds, with the hero image still
being the critical visual resource.

The production-style local Worker then verified the actionable cause and fix:
`pottery-house.localhost` returned the hero in SSR HTML, emitted one responsive
hero-image preload, marked ten lower-page images lazy, and produced no browser
errors. The in-app browser rendered the hero image successfully after the
preloaded image completed. This is a critical-path fix, not a claim that the
remote Lighthouse run is already below one second; the staging and production
browser checks must re-measure the deployed build.

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
