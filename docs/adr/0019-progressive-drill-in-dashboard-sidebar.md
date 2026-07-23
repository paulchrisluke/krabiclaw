# Progressive Drill-In Dashboard Sidebar, One Stable Shell

The authenticated dashboard needs organization, site, and location context switching, plus vertical-aware navigation (restaurant/experience/professional-service), without forking the sidebar per scope or per vertical. Issue #316 replaced the previous implementation, which computed `navbarTitle` and four separate `navigationItems` variants by regex-matching `route.path` (`inSettingsWorkspace`, `inLocationWorkspace`, `inConversationsWorkspace`, `inAdminWorkspace`), and which a first correction attempt on the same issue made worse by relocating that same route-path matching into a new composable instead of removing it.

## Considered Options

- **Separate sidebar shell per scope** (`OrganizationSidebar`/`SiteSidebar`/`LocationSidebar`, or per-scope Nuxt layouts): clearest per-scope styling, but reintroduces the exact "route-path decides which implementation renders" anti-pattern this issue exists to remove, and multiplies maintenance surface for every future vertical.
- **One sidebar, custom-styled back-link row above the switcher**: matches a progressive-drill-in UX at first glance, but the back-link's hand-rolled markup can't be guaranteed to match every other nav item's size/spacing without duplicating `UNavigationMenu`'s own theme classes, and drifts over time.
- **One sidebar, one stable `<UDashboardSidebar>`/`<UNavigationMenu>`, scope derived from explicit route params, parent row rendered as a normal nav item**: chosen.

## Decision

`layouts/dashboard.vue` renders exactly one `UDashboardSidebar` and one `UNavigationMenu` for every scope. A single `scope` computed (`'organization' | 'site' | 'location'`) is derived strictly from route params (`locationSlug` present → location; else `siteSlug` present → site; else organization) — never from `route.path` regexes or residual dashboard-context state. `useDashboardLocation()` resolves only the explicit `locationSlug`; the dashboard context API never supplies a preferred or implicitly selected location.

A single reusable `components/workspace/dashboard/DashboardScopeHeader.vue` renders only the current-level switcher (avatar/icon + label + dropdown of peers + a create action). It does not render the "back to parent" row — that row is built by the layout as one more `UNavigationMenu` item (`parentNavItem()` in `layouts/dashboard.vue`), guaranteeing it is sized identically to every other nav item by construction, not by hand-matching CSS.

Navigation groups are **strictly scope-exclusive**: `managerNavItems()` only includes a `CmsManagerCapability` when its own registry `scope` field equals the current drill-in `scope`, not merely when `siteBase`/`locationBase` happen to be non-null (they're non-null at every deeper scope too — checking only "does the base exist" was the second real bug found here, letting site-level items like Blog/Reviews/Settings leak into location scope, and org-level items leak into site scope).

Capability-driven nav (Content/Operate/Reputation/Publishing/Settings groups) is entirely sourced from `resolveCmsCapabilities()` (`config/cms-registry.ts`). A new vertical/template combination needs zero changes to the sidebar — only a new entry in `cmsCapabilityRegistry`. A genuinely new manager id (not just a new vertical reusing existing ids like `menu`/`reviews`/`blog`) needs one entry in each of `MANAGER_GROUP` and `MANAGER_ICON`; nothing else.

## Consequences

- Adding a fourth scope level (if the product ever needs one) means adding one branch to the `scope` computed, one `*OverviewGroup` computed, and one branch in `scopeHeaderModel` — not a new sidebar/layout.
- Any future PR that reaches for `route.path.startsWith(...)` to decide sidebar *structure* (not just to gate one group, e.g. the existing `/dashboard/account` check for the account-settings nav content) is reintroducing the removed anti-pattern and should be rejected in review.
- Org-level settings (general/members/billing) are intentionally distinct from site settings (brand, domains, navigation, footer, SEO, analytics and site-wide integrations) and location settings (profile, address, hours, notifications and location integrations). Each has its own canonical route under the explicit organization/site/location hierarchy.
