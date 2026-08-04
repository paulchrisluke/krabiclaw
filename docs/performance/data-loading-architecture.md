# Data-loading architecture

Public and dashboard data loading follows one rule: one logical resource key has
one canonical source, one in-flight promise, and one terminal result.

## Public renderer

The tenant page resource is keyed by site/draft, route parameters, locale, and
the requested datasets. Its response contains both the persistent shell
(identity, locations, configuration, locales, Google Business summary, and
capabilities) and the selected route data (content, menus, experiences,
availability, policies, and optional collections).

The tenant homepage has a smaller critical variant of that same canonical page
resource. It requests only the validated shell and homepage content rows needed
for the header and hero. The complete homepage resource uses a different key and
loads after the critical document has painted. A critical failure is still a
terminal error; it is never replaced with an empty or generic tenant shell.

During SSR, non-home `useSiteShellState` and `usePublicPageData` share the same
keyed `useAsyncData` state and call the request-scoped page provider once. The
homepage layout waits only for its critical keyed page resource; the home route
then starts its complete page resource after hydration. Both providers invoke
`loadPublicPage` with the original request event and Cloudflare bindings, so
there is no internal HTTP self-fetch. `loadPublicShell` remains the canonical
loader for the standalone shell API endpoint.

The public API routes are browser transport wrappers over the same loaders.
Browser reads use `publicApiRequest`, which applies a six-second timeout,
`retry: 0`, contract validation, exact-key in-flight coalescing, and normalized
errors.

Route-keyed async data is never copied between keys. A new route begins with its
own pending state; an obsolete result cannot populate a different route key.

## Dashboard and CMS

Dashboard state is keyed by `orgSlug` and `siteSlug`. `dashboardFetch` is the
only dashboard/CMS browser transport. It sends both route scopes explicitly,
uses `retry: 0`, applies the centralized read/mutation timeouts, and preserves
the server status and request ID in `ApiClientError`.

The application does not mutate `globalThis.$fetch`. Missing or conflicting
scope is a terminal error. The only context exception is the explicit
`afterTransfer=true` onboarding path.

## Database work

Availability reuses locations and the default timezone already loaded for the
public request, reads bookings and overrides with one unioned statement, then
indexes rows by experience and calculates slots in memory.
Booking policies load the complete site/type hierarchy in one query and resolve
site → location → experience precedence in memory.

## Cache and failure semantics

Cache is a warm optimization, not part of the cold-path contract. A fresh hit may
avoid the source load; a miss, invalid entry, or cache-read failure runs exactly
one canonical source load. Cache state never selects an alternate endpoint or
substitute payload. Source, contract, transport, timeout, authorization, and
database errors remain terminal errors. A cache-write failure after a successful
source load is instrumentation-only and cannot turn that valid response into a
second request or an empty success state.
