# ADR 0020: Final Dashboard CMS Contract

## Status

Accepted.

## Context

The CMS completion work in #316 moved the dashboard from overlapping organization,
site, location, editor, and proxy-era paths into one explicit route and capability
model. The final pass in #345 deletes compatibility aliases instead of preserving
them, so unsupported routes fail closed with 404s and visible navigation cannot
disagree with direct-route guards.

Historical #316 comments remain useful decision history, but this ADR is the
current implementation contract.

## Decision

The dashboard has one authenticated layout: `layouts/dashboard.vue`. It owns the
single `UDashboardSidebar`, single `UNavigationMenu`, dashboard search, account
menu, and scope header. Scope is derived only from explicit route params:

- organization: `/dashboard/:orgSlug`
- site: `/dashboard/:orgSlug/sites/:siteSlug`
- location: `/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug`

No route path regex, remembered location, implicit first site, or query parameter
may become the current dashboard scope.

Site is the normal CMS workspace. Organization remains the ownership, billing,
members, and account/settings boundary. Location is an operational child of a
site. Site and location overview, settings, content, and inbox routes remain
distinct.

Capability-dependent CMS managers come from `config/cms-registry.ts` through
`resolveCmsCapabilities()`. The dashboard layout may hardcode universal chrome
that is not product-capability dependent: Overview, Locations/Offices, Inbox,
Assistant, Domains, Settings, and account/organization settings. Product managers
such as menu, ordering, reservations/bookings, experiences, services, blog, media,
photos, posts, Q&A, and testimonials come from the resolver and are guarded by
matching page `cmsCapabilityKey` metadata.

Direct-route guards use the same resolved capability keys through
`server/utils/dashboard-route-capability.ts`. Unsupported manager pages 404; they
do not redirect to a nearby supported page.

Site-scoped editor and AI APIs use explicit site-id routes:

- `/api/editor/sites/:siteId/**`
- `/api/ai/:siteId/**`
- `/api/sites`
- `/api/sites/validate-subdomain`

The old `/api/dashboard/editor/**`, `/api/dashboard/ai/**`, `/api/dashboard/site`,
and generic `/api/dashboard/[...path]` proxy forms are deleted.

## Page Patterns

Overview page: read-only summary, quick links, counts, and recent activity. It owns
`UDashboardPanel` and `UDashboardNavbar`, uses bounded dashboard content width,
and does not contain full settings forms or operational queues.

Collection/index page: list/table/grid for a resource collection, create action
when authorized, loading skeletons, empty state, error/retry state, and canonical
links to item editors or child scopes.

Editor page: focused editing surface for one selected resource or CMS page. The
content editor host routes are client-rendered through route rules and call
explicit `/api/editor/sites/:siteId/**` endpoints. Save/publish/destructive
actions must show validation and confirmation in the editor surface.

Settings page: configuration only. Organization settings, site settings, and
location settings are separate pages. Site/location business-module toggles live
in settings, backed by `feature_overrides` deltas.

Operational workspace: inbox, reservations/bookings, orders, analytics, and other
work queues. Operational routes act on requests/conversations/status and do not
stand in for configuration pages.

## Consequences

- Visible nav, search/deep links, and direct guards share one route tree.
- Hybrid businesses are represented by explicit site/location feature deltas, not
  by inventing extra verticals or duplicate managers.
- Removed compatibility routes return 404.
- Source tests cover deleted aliases, one-layout/sidebar invariants, guardable
  page keys, Nuxt UI primitive consolidation, route builders, inbox assignment,
  and the current Saya/Blawby product matrix.
