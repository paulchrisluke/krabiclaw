# Data-loading architecture

Public and dashboard data loading follows one rule: one logical resource key has
one canonical source, one in-flight promise, and one terminal result.

## Public renderer

The tenant shell is keyed by site/draft and locale. It contains only persistent
chrome data: site identity, locations, configuration, locales, Google Business
summary, and the `hasExperiences` capability. Full menus, experiences,
availability, and booking policies belong to the route-keyed page payload.

During SSR, `useSiteShell` and `useBootstrap` call
`handlePublicBootstrap` directly with the current request event and Cloudflare
bindings. The public API route is the browser transport wrapper for that same
service. Browser reads use `publicApiRequest`, which applies a six-second
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

Availability loads locations/config, bookings, and overrides in a constant four
queries, then indexes rows by experience and calculates slots in memory.
Booking policies load the complete site/type hierarchy in one query and resolve
site → location → experience precedence in memory.

## Cache and failure semantics

Fresh cache hits may avoid the source load. Corrupt entries are discarded and
cause exactly one canonical source load. A cache-write failure after a
successful source load is logged and does not replace the successful result.
Transport, timeout, authorization, database, and contract errors remain errors;
they never become empty collections or inferred tenant context.

