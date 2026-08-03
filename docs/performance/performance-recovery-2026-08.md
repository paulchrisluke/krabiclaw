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
- Saya and Blawby use six checked-in Latin WOFF2 files from `/fonts/`, loaded by
  their own CSS entrypoints. Platform marketing deliberately uses the system
  font stack on its critical path; it does not wait for custom font downloads.
  Blawby keeps its gold/accent page bands and uses Poppins for body text and
  Marcellus for display text.
- The public platform header uses static Login and Start Free links. It does not
  resolve a session or import dashboard auth code on every public navigation.
- Vite `build.modulePreload` is disabled for this app. NuxtLink visibility
  prefetch is also disabled globally: the platform header exposes many visible
  links, and prefetching their route chunks during the first navigation pulled
  auth, signup, plugin, privacy, and other unrelated code into the cold trace.
  Route chunks load when their route or component is actually entered;
  dashboard, admin, and auth code remains out of public layout and CSS
  entrypoints.
- Saya home pages render the header, hero copy, brand color, and controls before
  attaching the remote hero image. The image is added after the first branded
  shell paint and then uses a responsive Cloudflare Images
  `320/640/960/1440` candidate at quality 45. The header logo follows the same
  boundary and starts as a local letter mark. Location, post, blog, and footer
  images remain lazy; the first location image is not marked high-priority beside
  the hero shell.
- Blawby home pages use the same opaque, branded hero shell before attaching a
  remote hero image. The YouTube video feature is intersection-gated and never
  creates an iframe on the initial document. A slow media origin therefore cannot
  make white text unreadable or pull third-party video JavaScript into the cold
  path.
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
surface-scoped. Home routes additionally use stable `*-home.css` files and a
critical inline shell. A Vite output plugin rewrites these CSS assets to stable
paths such as `/_nuxt/surfaces/platform.css`,
`/_nuxt/surfaces/platform-home.css`, `/_nuxt/surfaces/saya.css`,
`/_nuxt/surfaces/saya-home.css`, `/_nuxt/surfaces/blawby.css`, and
`/_nuxt/surfaces/blawby-home.css` in both the client output and server
references.
The existing postbuild step rewrites Nuxt's serialized client preload manifest
after Nitro generates it and makes the generated resource-hint renderer skip
preload/prefetch hints for those same surface stylesheets. It fails if a stable
file is missing, a hashed surface reference remains, or the generated renderer
no longer exposes the expected hint functions. The layouts' explicit SSR links
are therefore the only surface CSS requests. This prevents independent
client/server asset hashing from producing an SSR stylesheet or preload URL
that the deployment does not contain, and prevents the canonical stylesheet
from being fetched twice. Those stable files are served with revalidation
rather than immutable caching. The layouts normalize the imported URL to that
root-relative path so SSR and hydration produce one canonical `<link>` value
instead of relative and absolute duplicates.
Dashboard/editor CSS remains outside these public entrypoints. Home routes now
also have a critical inline shell: platform's root page is static HTML with a
small consent script, while Saya and Blawby inline only the header/hero geometry
and preload their full home stylesheet. The Worker defers the Nuxt runtime on
public GET routes, and the head handoff uses one stable key plus an explicit
client-side stylesheet state so hydration cannot revert the link to `preload`.
The full stylesheet is applied before the user reaches below-fold content, with
  one logical surface CSS request. The Worker removes the public Nuxt entry
  script from the initial HTML. Public pages retain native links and
  server-rendered content without JavaScript; the small inline interaction
  loader fetches the Nuxt entry only when a button, submit control, or other
  JavaScript-owned control is used, then replays that original action after the
  module loads. A failed module load is logged as an actionable hydration error;
  it is not replaced by a fallback path.

Blawby media URLs on real tenant hosts are rewritten from the separate
`media.krabiclaw.com` origin to the same-origin `/__public-media/sites/...`
Worker path. The R2 middleware is GET-only and fast-fails missing storage,
missing objects, and storage errors. Platform-hosted local previews retain the
direct media URL because the local R2 fixture is intentionally empty; this is a
preview measurement limitation, not a production fallback.

The final local build emitted these home stylesheet sizes (raw / gzip):
Platform `31,300 / 6,970` bytes, Saya `59,290 / 10,890` bytes, and Blawby
`62,560 / 11,260` bytes. Full route styles remain larger because they include
below-fold and detail-route components. Platform, Saya, and Blawby retain their
own route/component sources and font faces.

## Current cold-path measurements from the production-style local Worker

The current check uses a fresh query value for each navigation against the
rebuilt Worker. The HTML response is measured separately from browser paint,
and the browser check verifies the initial CSS, fonts, images, iframe count, and
runtime script count. The final three-run mobile Lighthouse medians against the
rebuilt Worker are:

| Surface | Performance | FCP | LCP | Speed Index | TBT | CLS | TTFB | Total transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Platform `/` | 1.00 | 0.76 s | 1.22 s | 0.99 s | 0 ms | 0 | 0.02 s | 27,531 B |
| Saya `/preview/site/site-pottery-house` | 0.94 | 1.10 s | 1.10 s | 1.10 s | 0 ms | 0 | 0.03 s | 440,928 B |
| Blawby `/preview/site/site-ncls-blawby` | 0.86 | 1.37 s | 1.37 s | 1.37 s | 0 ms | 0 | 0.03 s | 108,552 B |

These are three cold mobile Lighthouse samples using simulated mobile
throttling and cleared browser state. The ranges were Platform FCP
`0.76–0.99 s`, Saya FCP `0.92–1.11 s`, and Blawby FCP `1.37–1.42 s`.
In the corresponding Lighthouse traces, the browser-observed shell paint was
`0.56 s` for Platform, `0.10 s` for Saya, and `0.12 s` for Blawby. The simulated
values remain the release-gate numbers because they include the controlled
mobile network model; the observed values show that text, color, and geometry
are now available before remote media and Nuxt runtime work.

The platform root has met the first-paint target, but the public theme set has
not met the overall `<1s` simulated Lighthouse goal. This is now a smaller,
measurable remainder: Saya's and Blawby's simulated metrics include CSS/font
and remote-media scheduling, while their observed first branded shells are
already below one second. Blawby's initial document no longer creates a
YouTube iframe or starts Nuxt JavaScript; its hero image is attached after the
shell paint. Real custom tenant hosts still need a post-deploy cold browser run
through the same-origin R2 media path.

Cache hits are a warm optimization and cannot prove the cold target. The next
release gate is a cold browser run on a real tenant host with same-origin R2
media, plus request-count verification. No static image, stale content,
alternate endpoint, retry, or empty-success state may be added to make a failed
media request look successful.

## Browser trace follow-up

The live production trace reproduced the original failure: SSR HTML arrived
first with only the entry stylesheet, while the surface stylesheet appeared
later when the layout client chunk loaded. The resulting screenshot showed the
raw browser layout before the finished platform, Saya, or Blawby surface.

The corrected local Worker now renders the platform root as static HTML and
places the theme-critical shell plus CSS handoff in the initial SSR head. Public
tenant pages have no initial Nuxt runtime script, no Blawby YouTube iframe, and
no remote hero/logo requirement for the first readable shell. Fresh browser
screenshots showed readable text, correct colors, local fonts, initial logo
marks, and stable above-fold geometry immediately; the Blawby hero remains
visually branded while its remote image is pending. The strict preview asset
waiter remains in place so a deployment fails when HTML references an
unavailable asset; it validates the six stable public surface stylesheets
emitted by the build rather than an obsolete hashed `entry.css` filename.

The local cold-path result is materially improved but not declared solved: the
platform is under one second in simulated Lighthouse, while Saya and Blawby
remain above that threshold in the simulated release gate. The deployed Worker
and a real custom-domain image origin still need the same cold check after
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
