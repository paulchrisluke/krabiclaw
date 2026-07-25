# #316 CMS Final Completion Material

## Final Route Tree

```text
/dashboard
/dashboard/account/profile
/dashboard/account/authentication
/dashboard/account/billing-items
/dashboard/:orgSlug
/dashboard/:orgSlug/activity
/dashboard/:orgSlug/settings
/dashboard/:orgSlug/settings/general
/dashboard/:orgSlug/settings/analytics
/dashboard/:orgSlug/settings/billing
/dashboard/:orgSlug/settings/members
/dashboard/:orgSlug/settings/chatgpt
/dashboard/:orgSlug/sites
/dashboard/:orgSlug/sites/new
/dashboard/:orgSlug/sites/:siteSlug
/dashboard/:orgSlug/sites/:siteSlug/content
/dashboard/:orgSlug/sites/:siteSlug/content/:pageId
/dashboard/:orgSlug/sites/:siteSlug/blog
/dashboard/:orgSlug/sites/:siteSlug/blog/new
/dashboard/:orgSlug/sites/:siteSlug/blog/:postId
/dashboard/:orgSlug/sites/:siteSlug/testimonials
/dashboard/:orgSlug/sites/:siteSlug/qa
/dashboard/:orgSlug/sites/:siteSlug/media
/dashboard/:orgSlug/sites/:siteSlug/orders
/dashboard/:orgSlug/sites/:siteSlug/professional-services
/dashboard/:orgSlug/sites/:siteSlug/inbox
/dashboard/:orgSlug/sites/:siteSlug/domains
/dashboard/:orgSlug/sites/:siteSlug/settings
/dashboard/:orgSlug/sites/:siteSlug/locations
/dashboard/:orgSlug/sites/:siteSlug/locations/new
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/content
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/content/:pageId
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/menu
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/menu/items/new
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/menu/items/:itemId
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/experiences
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/reservations
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/posts
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/photos
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/qa
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/inbox
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/analytics
/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/settings
```

## Final Navigation By Scope

Organization scope: Dashboard, Sites, Activity, Settings.

Site scope: Overview, Inbox, Locations or Offices / Service Areas, Assistant,
Domains, Settings, plus capability-derived site managers such as Blog posts,
Testimonials, Q&A, Media library, Orders, and Professional services.

Location scope: Overview, Analytics when authorized, Content, Inbox, Settings,
plus capability-derived location managers such as Menus, Experiences,
Reservations/Bookings, Posts, Photos, and Q&A.

Always-on dashboard chrome is hardcoded only when it is universal infra and not
capability-dependent. Capability-dependent managers come from
`resolveCmsCapabilities()`.

## Final Capability Matrix

```text
Saya restaurant:
  site: blog, testimonials, qa, media, locations, settings, ordering
  location: menu, reservations, posts, photos, qa, settings

Saya restaurant with experiences enabled:
  site: restaurant matrix plus experiences public page support
  location: restaurant matrix plus experiences

Saya experience business:
  site: blog, testimonials, qa, media, locations, settings
  location: experiences, reservations shown as Bookings, posts, photos, qa, settings

Blawby professional service:
  site: blog, testimonials, qa, media, offices/service areas, settings, professional services
  location: posts, photos, qa, settings
```

Site feature disabled state removes the corresponding site/location business
module from nav and direct-route guards. Location feature disabled state narrows
only that location's inherited business modules. Content managers and universal
infra stay available so owners can create the first content item.

## Final Page Patterns

Overview pages summarize. Collection/index pages list. Editor pages edit one
selected resource. Settings pages configure. Operational workspaces handle
requests, conversations, and status changes.

`UDashboardPanel` and `UDashboardNavbar` are owned by route pages. Generic
interaction infrastructure uses Nuxt UI primitives. Retained custom dashboard/CMS
components are domain components: content editor/index, preview frame, menu and
post editors, media library/generation, inbox, settings, ChowBot, onboarding, and
booking policy composition.

## Removed Routes And Components

Removed route/API forms:

- `/dashboard/:orgSlug/sites/:siteSlug/new`
- `/dashboard/:orgSlug/settings/domains`
- `/api/dashboard/location-preference`
- `/api/dashboard/[...path]`
- `/api/dashboard/editor/**`
- `/api/dashboard/ai/**`
- `/api/dashboard/site`
- `/api/dashboard/site/validate-subdomain`
- `/dashboard/:orgSlug/sites/:siteSlug/reviews`
- `/dashboard/:orgSlug/sites/:siteSlug/locations/:locationSlug/media`

Removed architecture:

- query-driven CMS page/location selection
- route-path regex workspace detection
- remembered location as current scope
- implicit first-site resolution for dashboard scope
- duplicate dashboard editor/AI/site proxy routes
- location media and site reviews managers
- custom AppAvatar/AppToast/SettingsSection/search-popover infrastructure

## Verification Matrix

Automated coverage:

- `tests/unit/cms-product-matrix-contract.test.ts`: Saya restaurant, hybrid
  restaurant, Saya experience, Blawby, site-disabled and location-disabled states.
- `tests/unit/dashboard-ia.test.ts`: one layout/sidebar, canonical route files,
  deleted route files, no removed aliases in dashboard callers, explicit route
  params for scope, guardable `cmsCapabilityKey` values, canonical search paths.
- `tests/unit/dashboard-route-capability.test.ts`: nav/guard capability resolver
  behavior and deny/allow transitions.
- `tests/unit/guest-threads.test.ts` plus dashboard E2E: inbox assignment and
  site vs location filtering.
- `tests/e2e/dashboard.spec.ts`, `local-access.spec.ts`,
  `universal-cms.spec.ts`, and `site-creation.spec.ts`: canonical pages,
  role/scope combinations, removed-route 404s, responsive sidebar, direct-route
  authorization, and canonical site creation.

Manual verification target:

```text
Saya restaurant
Saya restaurant with experiences enabled
Saya experience business
Blawby professional service
single-site owner
multi-site owner
multi-organization owner
site manager
location manager
site with one location
site with multiple locations
site feature disabled
location feature disabled
supported direct route
unsupported direct route
site inbox with unassigned contact
location inbox without unassigned contact
desktop expanded sidebar
desktop collapsed sidebar
mobile sidebar
light mode
dark mode
system mode
```

This document is the prepared final #316 completion comment material. Post it to
#316 when the #345 PR is accepted.
