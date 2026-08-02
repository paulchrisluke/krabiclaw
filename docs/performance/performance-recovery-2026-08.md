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
- SSR paths still had to be kept off internal HTTP self-fetches because nested
  Nitro dispatch does not carry the Worker bindings reliably.

The cleanup removes those calls and coupling points. Pricing owns its single
canonical plans load. The homepage makes no plans request. Dashboard home does
not load the onboarding checklist. Failed API responses remain typed errors with
an error code and request ID.

## Client boundary decisions

- Public home, Saya, Blawby, platform marketing, help, and dashboard/editor CSS
  enter through their owning layouts or route components.
- Dashboard/editor code is not globally imported merely for component
  registration.
- Nuxt UI color-mode runtime is disabled. Platform theme preference is managed
  by `usePlatformTheme`, which owns the `html.dark` class and persists the
  explicit `system`, `light`, or `dark` preference. Saya uses its existing theme
  class contract. Blawby is intentionally light-only.
- Fonts are self-hosted by `@nuxt/fonts`; no runtime plugin adds a Google Fonts
  stylesheet. Blawby keeps its gold/accent page bands and uses Poppins for body
  text and Marcellus for display text.
- The public platform header uses static Login and Start Free links. It does not
  resolve a session or import dashboard auth code on every public navigation.

Blawby also had a concrete first-paint bug: its layout manually injected a
hashed CSS URL that could differ between the server manifest and the client
manifest. That produced a stylesheet 404 and a flash of unstyled or inverted
text before the correct CSS arrived. The layout now imports the CSS normally so
Nuxt emits one route-owned stylesheet reference.

## Measurements from the production-style local Worker

After the CSS, public-header, and lazy-boundary fixes, a smoke pass against the
rebuilt Worker observed these server-side response times:

| Route | Worker response |
| --- | ---: |
| `/` | 362 ms |
| `/pricing` | 730 ms |
| `/preview/site/site-ncls-blawby/about` | 1,338 ms cold / 626 ms warm |
| `/dashboard/pottery-house-krabi` | 999 ms |

The in-app browser's full `goto` waits were higher in this run because Wrangler
served many hashed assets through its remote preview connection; that is asset
transport overhead, not additional application data work. Pricing is now below
one second at the Worker boundary while performing its single canonical billing
lookup. Blawby is below one second warm and remains the route to watch because
its shell and page data require more D1 work on a cold request.
The universal client entry is about 389 KB raw / 137 KB gzip. The 517 KB raw
editor chunk is route-only and is not loaded by the public homepage.

These are smoke observations, not a statistically meaningful benchmark. The
blocking checks are request count, query count, payload size, own-origin SSR
requests, and error propagation. Comparative wall-clock benchmarking belongs in
the final merge-ready lane, not in every editing loop.

## Validation contract

Use the production-style Worker and browser for representative smoke checks:

- homepage: zero billing-plan requests;
- pricing: exactly one canonical plans request;
- dashboard home: zero onboarding-checklist requests;
- failed API data: visible actionable error, never an empty success state;
- no duplicate logical resource requests;
- no `ERR_HTTP_HEADERS_SENT` messages;
- public pages do not preload dashboard/editor-only CSS or chunks.

Keep shared transport/error/request-budget tests at the invariant level. Do not
add one page test per duplicate request or another benchmark suite that merely
repeats the same contract.
