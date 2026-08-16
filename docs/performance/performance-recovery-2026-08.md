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
- historical root/layout ownership briefly coupled Blawby routes to the generic
  Saya/site shell even though Blawby has its own route and shell services;
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
- Saya home pages use a critical canonical page resource for the header, hero
  copy, brand color, controls, and responsive hero geometry in SSR. The complete
  homepage collections use a separate keyed page resource after hydration. The
  header logo is emitted immediately when tenant data supplies one; hero,
  location, post, blog, and footer media are lazy so the first styled frame does
  not wait on an image origin.
- Blawby home pages use a critical canonical document containing the validated
  shell and homepage hero document in SSR. Offerings, FAQs, reviews, posts, and
  lower-page blocks use the complete route document after hydration. The remote
  hero image is lazy and low priority. The YouTube video feature is
  intersection-gated and never creates an iframe on the initial document. A
  slow media origin therefore cannot delay readable text or pull third-party
  video JavaScript into the cold path.
- Post videos remain poster-only until their card enters a 200px viewport
  margin; autoplay is mounted only after that visibility gate opens.
- The Google Places photo contract is `google_url`. Reading it with the old
  camel-case name left tenants without CMS hero media with an empty hero image;
  the home hero now uses the canonical response field.

The public surfaces also had a concrete first-paint bug: their layouts imported
entry CSS as a client-side module side effect. SSR could therefore deliver the
complete HTML without a surface stylesheet in the document head. The browser
painted default fonts, colors, and layout until hydration loaded the layout
chunk. Platform, Saya, and Blawby now import one compiled surface stylesheet and add
the URL through `useHead`, so SSR emits the stylesheet link while the CSS stays
surface-scoped. Home routes additionally use stable `*-home.css` files and a
critical inline shell. A Vite output plugin rewrites these CSS assets to stable
paths such as `/_nuxt/surfaces/platform.css`,
`/_nuxt/surfaces/platform.css`, `/_nuxt/surfaces/saya.css`, and
`/_nuxt/surfaces/blawby.css` in both the client output and server
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
small consent script, while Saya and Blawby inline the header/hero geometry and
preload their full home stylesheet at low priority. The stylesheet is promoted
to `rel="stylesheet"` by its own load event; the inline critical CSS is the
above-fold render contract, so the full below-fold sheet does not block the
first styled paint. The Worker defers the Nuxt runtime on public GET routes and
removes both the public Nuxt entry script and its `__NUXT_DATA__` payload from
the initial HTML. Public pages retain native links and server-rendered content
without JavaScript; the small inline interaction loader fetches the Nuxt entry
only when a button, submit control, or other JavaScript-owned control is used,
then replays that original action after the module loads. A failed module load
is logged as an actionable hydration error; it is not replaced by a fallback
path.

Blawby media keeps its canonical `media.krabiclaw.com` URL. The Worker media
middleware serves only the explicit same-origin `/__media/...` upload path;
public tenant media is not rewritten into an environment-specific R2 bucket,
because preview and staging fixtures can legitimately reference the canonical
media origin.

The final local build emitted these home stylesheet sizes (raw / gzip):
Platform `31,300 / 6,970` bytes, Saya `59,290 / 10,890` bytes, and Blawby
`62,560 / 11,260` bytes. Full route styles remain larger because they include
below-fold and detail-route components. Platform, Saya, and Blawby retain their
own route/component sources and font faces.

## Current cold-path measurements from the production-style local Worker

The current check uses a fresh query value for each navigation against the
rebuilt Worker. The HTML response is measured separately from browser
navigation, and the browser check verifies the initial CSS, fonts, above-fold
image markup, iframe count, and runtime script count. The fresh single-pass
local Worker measurements for this build are:

| Surface | Browser navigation | HTML body | Server `total` | Surface stylesheet |
| --- | ---: | ---: | ---: | --- |
| Platform `/` | 64 ms | 32,285 B | 13 ms | `platform.css` |
| Saya `/about` (`demo.localhost`) | 246 ms | 10,728 B | 29 ms | `saya.css` |
| Blawby `/` (`ncls.localhost`) | 166 ms | 71,615 B | 170 ms | `blawby.css` |

These are local browser navigation measurements, not Lighthouse FCP/LCP and not
the release gate. They verify the shared response contract: the correct surface
stylesheet is present in the document head, public tenant pages have no initial
Nuxt runtime or `__NUXT_DATA__` payload, and the above-fold hero markup is
present in the initial HTML. The Saya screenshot showed the about heading with
its serif face; the Blawby screenshot showed the navy/gold shell and readable
hero copy while the R2-backed hero image was lazy. The `<1s` cold browser target
remains open until the same checks run against deployed tenant hosts.

Cache hits are a warm optimization and cannot prove the cold target. The next
release gate is a cold browser run on a real tenant host with same-origin R2
media, plus request-count verification. No static image, stale content,
alternate endpoint, retry, or empty-success state may be added to make a failed
media request look successful.

## Browser trace follow-up

The live production trace reproduced the original failure: the Worker buffered
the transformed SSR document, and the browser could not begin work discovered
only in the body until the document finished. The platform and tenant hero/logo
media were also being delayed by two animation frames, so they were absent from
the initial HTML request graph.

The corrected local Worker now renders the platform root as static HTML and
places the theme-critical shell in the initial SSR head. Public tenant pages
have no initial Nuxt runtime or `__NUXT_DATA__` payload, no Blawby YouTube iframe,
and no animation-frame gate on above-fold hero or logo media. Fresh browser
screenshots showed readable text, correct colors, local fonts, and stable
above-fold geometry immediately. The strict preview asset
waiter remains in place so a deployment fails when HTML references an
unavailable asset; it validates the six stable public surface stylesheets
emitted by the build rather than an obsolete hashed `entry.css` filename.

The local cold-path result is materially improved but not declared solved: the
browser check is fast in the local Worker, while a fresh cold measurement from a
deployed Worker and real custom-domain image origin is still required before
claiming the `<1s` target.

## Shared client-path diagnosis and measured fix

The client-side bottleneck was shared SSR work, not the number of Vue files or a
single theme component. Saya layout setup loaded the shell resource while the
route component loaded the page resource. Both used the same Worker request
context but each performed its own source batch, so a cold D1 wake-up made the
browser wait for two logical resource loads before the complete first document
was available. Blawby did not have that same two-loader database path; its first
frame was instead coupled to eager/high-priority hero media and the complete
hydration payload.

The fix keeps the Saya page response as the canonical source and adds a critical
homepage variant that projects its validated `shell` and `content` fields to the
layout and hero. The complete page response remains keyed separately for the
post-paint collections. Blawby adds the equivalent critical document service and
API wrapper, while the complete route document remains the source for lower-page
sections. Both surfaces still fast-fail on malformed data; no alternate source,
retry, stale payload, or empty success state was introduced.

The following are single fresh local-Worker observations with KV bypassed, not a
benchmark or a Lighthouse score:

| Journey | Before | After | What changed |
| --- | ---: | ---: | --- |
| Saya `/about` server total | 55 ms | 29 ms | Separate shell/page loads became one page load; D1 request count 5 → 2 |
| Saya `/about` browser navigation | — | 246 ms | Styled heading, local fonts, and surface CSS were visible in the fresh tab |
| Blawby `/` browser navigation | — | 166 ms | Critical text/colors rendered; hero image was lazy/low priority and no Nuxt payload remained |

These local measurements are evidence that the duplicate shared path is gone,
not evidence that the production `<1s` target is already met. The release gate
remains a cold browser run against deployed tenant hosts with real media and
server/request metrics.

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
