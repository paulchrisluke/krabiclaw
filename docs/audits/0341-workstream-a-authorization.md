# #341 Workstream A — authorization migration audit

Tracks every endpoint/call site converted off the retired `location_manager`
role and the unscoped `role IN ('owner','admin','editor')` pattern, onto the
five explicit access checks in `server/utils/member-access.ts`:

- **Organization** — `assertOrganizationAccess`: owner/admin only.
- **Site-wide** — `assertSiteWideAccess`: org-wide roles, or an editor with a
  `location_id IS NULL` scope row for the site.
- **Location** — `assertLocationAccess`: org-wide roles, a site-wide-scoped
  editor, or an editor scoped to the exact location.
- **Conditional** — `assertResourceAccess`: the target row's own
  `location_id` decides Site-wide vs. Location per-request.
- **Context** — `assertSiteContextAccess`: org-wide roles, or any scope row
  at all for the site (discovery/navigation only, never full config).

Classification is derived from the resource's own schema/mutation semantics
(does the row have a `location_id`, is it NOT NULL, does the endpoint
aggregate across locations), never from the URL shape alone.

| Endpoint | Org | Site-wide | Location | Conditional | Context | Guard used |
|---|---|---|---|---|---|---|
| `server/utils/blog-access.ts` (`requireBlogAccess`) | | ✓ | | | | `requireSiteAccess` default |
| `dashboard/sites/[siteId]/guest-threads/index.get.ts` | | | | ✓ (per-thread, `location_id` from query) | ✓ (baseline) | `requireSiteAccess('context')` + `assertMemberScope` |
| `dashboard/sites/[siteId]/guest-threads/[threadId].get.ts` | | | | ✓ (thread's own `location_id`) | ✓ (baseline) | `requireSiteAccess('context')` + `assertMemberScope` |
| `dashboard/sites/[siteId]/guest-threads/[threadId].patch.ts` | | | | ✓ | ✓ (baseline) | `requireSiteAccess('context')` + `assertMemberScope` |
| `dashboard/sites/[siteId]/guest-threads/[threadId]/reply.post.ts` | | | | ✓ | ✓ (baseline) | `requireSiteAccess('context')` + `assertMemberScope` |
| `editor/sites/[siteId]/locations/[locationId]/qa.get.ts` | | | ✓ | | | `requireLocationAccess` |
| `editor/sites/[siteId]/locations/[locationId]/qa.post.ts` | | | ✓ | | | `requireLocationAccess` |
| `editor/sites/[siteId]/locations/[locationId]/qa/[qaId].delete.ts` | | | ✓ | | | `requireLocationAccess` |
| `sites/[siteId]/locations/[locationId]/reviews.get.ts` | | | ✓ | | | `requireLocationAccess` |
| `editor/sites/[siteId]/customers/[customerId].get.ts` | | ✓ | | | | `requireSiteAccess` default (cross-location aggregate) |
| `editor/sites/[siteId]/contact-submissions/[submissionId]/reply.post.ts` | ✓ | | | | | `requireSiteAccess('context')` + `assertOrganizationAccess` |
| `editor/sites/[siteId]/experience-bookings/[bookingId]/reply.post.ts` | ✓ | | | | | same |
| `editor/sites/[siteId]/reservation-submissions/[submissionId]/reply.post.ts` | ✓ | | | | | same |
| `editor/sites/[siteId]/reviews.post.ts` | ✓ | | | | | same |
| `editor/sites/[siteId]/reviews/[reviewId].delete.ts` | ✓ | | | | | same |
| `editor/sites/[siteId]/reviews/[reviewId].patch.ts` | ✓ | | | | | same |
| `sites/[siteId]/locations/[locationId].delete.ts` | ✓ | | | | | same |
| `editor/sites/[siteId]/qa.get/post.ts`, `qa/[qaId].patch/delete.ts`, `qa/reorder.post.ts`, `qa/scopes.get.ts` | | ✓ | | | | `requireSiteAccess` default (no location param in path; site-wide FAQ) |
| `editor/sites/[siteId]/reviews.get.ts`, `tenant-pages.get.ts` | | ✓ | | | | `requireSiteAccess` default |
| `editor/sites/[siteId]/menus.post.ts` | | | | ✓ (`body.locationId`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId].get.ts` | | | | ✓ (menu row `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId].patch.ts` | | | | ✓ | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId].delete.ts` | | | | ✓ | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/items.post.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/items/[itemId].patch.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/items/[itemId].delete.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/reorder.post.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/sections.patch.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/menus/[menuId]/sections.delete.ts` | | | | ✓ (parent menu's `location_id`) | | inline SQL + `assertResourceAccess` |

**menus/* family: complete (10/10).**

| `editor/sites/[siteId]/media/index.get.ts` | | | | ✓ (query `locationId`, or asset's own for `?id=`) | | inline SQL + `assertResourceAccess` (no filter = site-wide only) |
| `editor/sites/[siteId]/media/[assetId].patch.ts` | | | | ✓ (asset's current `location_id`, and target if changing) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/media/[assetId].delete.ts` | | | | ✓ | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/media/[assetId]/confirm.post.ts` | | | | ✓ | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/media/upload.post.ts` | | | | ✓ (`formData.locationId`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/media/request-upload.post.ts` | | | | ✓ (`body.locationId`) | | inline SQL + `assertResourceAccess` |

**media/* family: complete (6/6 — index.get + 5 mutation routes; `[assetId]` folder has 1 file (confirm) plus the 2 top-level `[assetId].*` files).**

**Fixed compiler blockers (deleted-export references) and MCP/ChowBot/WhatsApp access this pass:**
- `server/utils/mcp-auth.ts` — `requireMcpSite` now requires a site-wide `member_access_scope` row for non-org-wide roles (MCP tools have no location-scoped permission model yet; this only tightens, never loosens, since `location_manager` was never a valid `McpToolRole` before either).
- `server/utils/chowbot-conversations.ts` — `getSiteForMember`/`listSitesForMember` same site-wide requirement (ChowBot is whole-site conversational, no location scoping at this layer).
- `server/utils/whatsapp-access.ts`, `server/utils/whatsapp-revocation.ts` — `LOCATION_MANAGER_ROLE` → `'editor'` literal / `isScopedRole()`.
- `server/api/dashboard/organizations/members/[memberId]/remove.post.ts` — same.

## `/api/dashboard/**` scoped-editor boundary

`getDashboardContext` retains a deny-by-default route boundary for scoped
editors. It is not an authorization substitute: every permitted route below
also applies the listed authoritative guard or filters its query by
`member_access_scope`. Routes not listed are rejected before their handler can
use context-only site resolution. Historical `/api/dashboard/editor/**`,
`/api/dashboard/ai/**`, and `/api/dashboard/site` aliases were deleted in #345;
site-scoped editor and AI work now uses explicit `/api/editor/sites/[siteId]/**`
and `/api/ai/[siteId]/**` routes.

| Endpoint | Organization | Site-wide | Location | Conditional | Context-only | Guard used |
|---|---|---|---|---|---|---|
| `dashboard/context.get.ts` | | | | ✓ (site/location lists) | ✓ | `assertSiteContextAccess` in `getDashboardContext`; `listOrganizationSites` and `listDashboardLocations` filter by the member's scope rows |
| `dashboard/home.get.ts` and SSR `getDashboardHomeData` caller | | | | ✓ | | locations and events use `EXISTS member_access_scope`; null-location aggregate events require a site-wide row; organization credit totals are omitted for scoped roles |
| `dashboard/settings.get.ts`, `settings.patch.ts` | | ✓ | | | | `assertSiteWideAccess` after context resolution |
| `dashboard/locations/index.get.ts` | | | ✓ (filtered list) | | | `EXISTS member_access_scope`; site-wide rows include all locations, location rows include only exact locations |
| `dashboard/locations/[id].get.ts`, `[id].patch.ts` | | | ✓ | | | target location supplies `site_id`; `assertLocationAccess`/`assertMemberScope` before return or mutation |
| `dashboard/locations/add.post.ts` | | ✓ | | | | `assertSiteWideAccess` before preview, credit charge, or creation |
| `dashboard/notifications/index.get.ts`, `unread-count.get.ts`, `read-all.patch.ts`, `[notificationId]/read.patch.ts` | | | | ✓ | | `getNotificationAccess`: location notifications require exact/site-wide scope; null-location site notifications require site-wide scope; reads mutate only visible notifications |
| `dashboard/sites/[siteId]/guest-threads/index.get.ts` | | | | ✓ (query location; no location means site-wide) | ✓ | `requireSiteAccess('context')` + `assertMemberScope`; list query is location-filtered |
| `dashboard/sites/[siteId]/guest-threads/[threadId].get.ts`, `.patch.ts`, `/reply.post.ts` | | | | ✓ (thread row's own `location_id`) | ✓ | target thread lookup followed by `assertMemberScope` before read/mutation/reply |
| `dashboard/onboarding/checklist.get.ts?siteId=…` | | ✓ | | | | explicit site path uses `requireSiteAccess('site-wide')`; it cannot expose sibling-site aggregate state to a location-scoped editor |

Authenticated user-owned creation routes (`dashboard/site.post.ts`,
`site/validate-subdomain.post.ts`, `onboarding/places-preview.post.ts`, and
`onboarding/drafts/{manual,from-place,[draftId]/commit}.ts`) do not grant or
read an existing organization's resources: drafts are keyed to the session
user, commit re-checks `draft.user_id`, and site creation creates the caller's
own organization/site. They therefore sit outside the member-scope matrix.

The deny boundary rejects scoped editors from organization-wide dashboard
routes (`members`, invitations, organization member removal, activity/events,
work requests), onboarding mutations against an existing site, location copy,
and any unknown catch-all proxy path. Those routes remain available to
owner/admin callers and keep their existing organization-level checks.

| `editor/sites/[siteId]/blog/[postId].delete.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` (`blog_posts` has no `location_id`) |
| `editor/sites/[siteId]/posts.get.ts` | | | | ✓ (query `location_id`) | | inline SQL + `assertResourceAccess` (`posts` table location_id nullable; distinct from `blog_posts` — this is the per-location "Posts" feature) |
| `editor/sites/[siteId]/posts.post.ts` | | | | ✓ (`body.location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/posts/[postId].get.ts` | | | | ✓ (post's own `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/posts/[postId].patch.ts` | | | | ✓ (current + target `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/posts/[postId].delete.ts` | | | | ✓ (post row's own `location_id`) | | `loadMemberSiteRow` + `assertResourceAccess` |
| `editor/sites/[siteId]/posts/[postId]/publish.post.ts` | | | | ✓ (post row's own `location_id`) | | `loadMemberSiteRow` + `assertResourceAccess` before site/social publication |
| `editor/sites/[siteId]/translations/{inventory.get,jobs.get,jobs/[jobId].get,review.get,review.patch}.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` (translations have no location concept) |
| `editor/sites/[siteId]/translations/{jobs.post,publish.post,jobs/[jobId]/run.post}.ts` | ✓ (already owner/admin-only) | | | | | unchanged — not editor-affected |
| `editor/sites/[siteId]/content/[page].get.ts`, `content/save.post.ts`, `content/delete-field.post.ts` | | | | ✓ (query/body `locationId`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/locales/index.get.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` |
| `editor/sites/[siteId]/locales/{index.post,[locale].patch,[locale].delete}.ts` | ✓ (already owner/admin-only) | | | | | unchanged — not editor-affected |

**blog/content/translations/locales family: complete.** Typecheck + lint clean.

| `editor/sites/[siteId]/professional-services.get.ts`, `.patch.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` |
| `editor/sites/[siteId]/booking-policy.get.ts`, `.patch.ts`, `booking-policy/preview.post.ts` | | | | ✓ (`location_id` or resolved via `experience_id`'s own location) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/experiences/index.get.ts` | | | ✓ (filtered to accessible locations, not just gated) | | | inline SQL + `listAccessibleLocationIds` post-filter |
| `editor/sites/[siteId]/experiences/index.post.ts` | | | | ✓ (requested or primary `location_id`) | | `requireSiteAccess('context')` + `assertResourceAccess` before creation |
| `editor/sites/[siteId]/experiences/[experienceId]/{index.patch,index.delete,availability.get}.ts` | | | | ✓ (experience's own `location_id`; patch also guards the target location before a move) | | `requireSiteAccess('context')` + `assertResourceAccess` |
| `editor/sites/[siteId]/experiences/[experienceId]/slot-overrides{.get,.post,/[overrideId].delete}.ts` | | | | ✓ (parent experience's own `location_id`) | | `requireSiteAccess('context')` + `assertResourceAccess`; override deletion never trusts caller scope |
| `editor/sites/[siteId]/experiences/[experienceId]/bookings.get.ts`, `.patch.ts` | | | | ✓ (experience's own `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/experience-bookings.get.ts` | | | | ✓ (query `location_id`, no filter = site-wide) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/experience-bookings/[bookingId].patch.ts`, `.../complete.post.ts`, `.../review-request.post.ts` | | | | ✓ (booking's own `location_id`) | | inline SQL + `assertResourceAccess` |
| `editor/sites/[siteId]/reservation-submissions/[submissionId].patch.ts`, `.../complete.post.ts`, `.../review-request.post.ts` | | | | ✓ (submission's own `location_id`, fetched directly rather than trusting a query param) | | inline SQL + `assertResourceAccess` |

**professional-services/booking-policy/experiences/bookings/reservations family: complete.** Typecheck + lint clean.

| `editor/sites/[siteId]/contact-submissions/[submissionId].patch.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` (no `location_id` column; explicitly forbidden cross-location inbox) |
| `ai/[siteId]/enhance-prompt.post.ts`, `ai/[siteId]/posts/generate.post.ts` | | ✓ | | | | inline SQL + `assertSiteWideAccess` (no location param accepted; save-time endpoints already enforce the real target location) |
| `ai/[siteId]/generate-image.post.ts` | | | | ✓ (`body.locationId`) | | inline SQL + `assertResourceAccess` |
| `ai/[siteId]/menu/extract.post.ts` | | | | ✓ (existing menu's own `location_id`, or site-wide when creating a new menu) | | inline SQL + `assertResourceAccess`/`assertSiteWideAccess` |

**contact-submissions/AI routes family: complete.** Typecheck + lint clean.

| `sites/[siteId]/settings.get.ts`, `settings.patch.ts`, `analytics.get.ts`, `setup-progress.get.ts` | | ✓ | | | | `loadMemberSiteRow`/`requireSiteAccess` + `assertSiteWideAccess` |
| `sites/[siteId]/domains.get.ts`, `.post.ts`, `[domainId].patch.ts`, `[domainId].delete.ts`, `[domainId]/sync.post.ts` | | ✓ | | | | `loadMemberSiteRow`/`requireSiteAccess` + `assertSiteWideAccess` |
| `sites/[siteId]/integrations/google-analytics/{auth,disconnect,properties,select}` | | ✓ | | | | `requireSiteAccess` + `assertSiteWideAccess` |
| `integrations/google-places/sync.post.ts` | | | ✓ | | | `requireRequestedLocationAccess` before sync or credit charge |
| `integrations/facebook-pages/auth.post.ts`, `connection.get.ts`, OAuth callback | | ✓ | ✓ (connection status with explicit location) | | | site settings use `requireRequestedSiteWideAccess`; location posts pass their exact location through `requireRequestedLocationAccess`; callback revalidates site-wide access before storing credentials |
| `sites/[siteId]/locations/[locationId].get.ts` | | | ✓ | | | inline SQL + `assertLocationAccess` |
| `sites/[siteId]/locations.post.ts` | | ✓ | | | | `requireSiteAccess` + `assertSiteWideAccess` |
| `sites/[siteId]/locations/[locationId].patch.ts` | | | ✓ | | | `requireLocationAccess` |
| `sites/[siteId]/locations/[locationId]/integrations/google-business/index.get.ts`, `auth.post.ts` | | | ✓ | | | `requireLocationAccess`; OAuth callback revalidates the state principal's exact location access before storing credentials |
| `editor/sites/[siteId]/context.get.ts` | | | | | ✓ | inline SQL + `assertSiteContextAccess`; response now filters `locations`/`scopes` to `listAccessibleLocationIds`, and drops the "Brand-wide" scope option for location-only editors — this endpoint was previously **not caught by the initial 58-file grep** (found only in the final proof sweep) and was returning the full site directory to any editor regardless of scope |
| `editor/sites/[siteId]/locations/[locationId]/qa/[qaId].patch.ts`, `qa/reorder.post.ts` | | | ✓ | | | inline SQL + `assertLocationAccess` — also missed by the initial grep pass, found in the proof sweep |
| `whatsapp/webhook.post.ts` (`listRecentGuestNotificationCandidates`) | | | | | | dropped `location_manager` from the role OR; unchanged logic otherwise |

**sites/[siteId] family + proof-sweep stragglers: complete.** Domain and Google Analytics mutation routes use the same site-wide guard as their reads; they do not retain an owner/admin-only role-name query that would contradict the site-manager scope contract.

**Repository-wide proof sweep (run after every family, final pass clean):**
```text
location_manager        → 0 live-code hits (comments/migration file only)
LOCATION_MANAGER_ROLE    → 0 hits
role IN ('owner', 'admin', 'editor')  → 0 hits
role IN ("owner", "admin", "editor")  → 0 hits
role === 'editor' as bypass → 0 (only isScopedRole's own definition + normalizeRole's role-name validation, both non-bypassing)
```

**Lesson from this pass:** the initial classification table was built from a single grep pattern (`role IN ('owner', 'admin', 'editor')`) — two real endpoints (`context.get.ts`, two `qa` files) used the identical pattern but were missed in the first listing due to a stale file enumeration, not a different SQL shape. The proof-sweep step is what caught them, confirming the sweep must run for real at the end, not be treated as a formality.

**WhatsApp grant provenance resolved:** migration `0060` adds `grant_source` to
both pending and active access scopes. Existing `location_manager` grants are
marked `whatsapp_config` before their role is converted; existing editor access
is backfilled as `migration_backfill`; ordinary dashboard invitations remain
`manual`. A later manual grant takes precedence over an existing WhatsApp grant.
`recalculateScopesForPhoneChange` now deletes only `whatsapp_config` scopes, so
changing a notification phone cannot revoke independently granted editor access.

**Migration and creation paths:** Better Auth no longer registers
`location_manager`; migration `0060` converts existing members and pending
invitations to `editor`; the WhatsApp backfill script and all new invitation
paths create `editor` roles with explicit scope provenance.

**Review hardening:** the site/member principal query now lives in
`server/utils/location-access.ts` and is reused by the reviewed media, menu,
post, content, booking, translation, analytics, settings, and setup routes.
Missing membership responses are consistently non-enumerating 404s, and media
authorization derives the organization from the verified site rather than the
asset row. Pending pre-migration `editor` invitations are backfilled across
their organization's current sites, including invitations that had no scope
row. The dashboard invite form invalidates in-flight site/location requests
when the route organization changes, and surfaces the scope API's error body.
MCP tool discovery distinguishes an omitted `site_id` from a blank or
inaccessible supplied value and fails closed for the latter two. ChowBot's
site-wide scope lookup joins through the current user instead of constructing
an unbounded `IN` list, keeping it below D1's bind limit. Dev E2E member,
membership, and editor-scope provisioning now run as one atomic D1 batch in a
shared utility.

**Final local verification:** all 60 migrations applied to a clean D1 state;
the unit suite passed 487/487; typecheck, lint, Drizzle, migration safety,
migration lint, seed lint, and tool-parity checks passed; the scoped invitation
Playwright flow passed 2/2; and the mandatory Pottery House fixture passed
52/52 against `http://localhost:3000`. The two MCP role-visibility regressions
from the first CI run also pass locally, including fail-closed tool discovery
for inaccessible and blank site identifiers. The scoped dashboard regression
now proves context, home, and location lists filter sibling locations; exact
location reads and mutations reject siblings; the removed location-preference
endpoint returns 404; site settings,
add-location, onboarding aggregates, and AI credits reject a location-only
editor; and location-scoped menu reads accept only the authorized location.

**Workstream A status: complete.** Every endpoint family listed above,
including the `/api/dashboard/**` deny boundary, is converted and audited. The
repository-wide proof sweep, migration contract test, full unit suite,
typecheck, lint, Drizzle check, and migration safety check are the completion
evidence for this workstream.
