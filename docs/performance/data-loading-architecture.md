# Data-loading architecture

Public and dashboard data loading follows one rule: one logical resource key has
one canonical source, one in-flight promise, and one terminal result.

## Public renderer

The tenant shell is keyed by site/draft and locale. It contains only persistent
chrome data: site identity, locations, configuration, locales, Google Business
summary, and the `hasExperiences` capability. Full menus, experiences,
availability, and booking policies belong to the route-keyed page payload.

During SSR, `useSiteShell` and `usePublicPageData` call the request-scoped public
resource provider, which invokes `loadPublicShell` and `loadPublicPage` with
the original request event and Cloudflare bindings. The public API routes are
browser transport wrappers over those same loaders. Browser reads use
`publicApiRequest`, which applies a six-second
timeout, `retry: 0`, contract validation, exact-key in-flight coalescing, and
normalized errors.

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

Fresh cache hits may avoid the source load. A missing or corrupt entry causes
exactly one canonical source load. Cache-write failures, source failures, and
contract failures remain terminal errors; they never become stale, static, or
empty substitute data. Transport, timeout, authorization, and database errors
also remain errors and never infer tenant context.
