# Handoff: the leaves and sheets

Written 2026-09-21 at the end of the navigation round (PR #1039, promoted to production in #1040). Read `NAVIGATION.md` first; it is the model the dashboard now follows and the Airbnb evidence behind it.

## Where things stand

- **One business.** Org = site = business. Tabs: Today · Calendar · Locations · Messages · Menu. Locations is Airbnb's Listings (tiles, one tap in). Menu is the business's page: Pages · Blog · Reviews and Q&A · Brand · Website · Team · Billing · Payouts · Log out. No site hub, no site index, no second site. Routes still carry `/sites/:siteSlug` underneath; `useDashboardSiteLinks().businessPaths` gives the one site's paths from anywhere.
- **Back** is `router.back()` with `/dashboard` as the only fallback (`DashboardNavbarLeading`, no props). Nothing declares a parent.
- **Settings behind the gear** are flat lists titled Settings (location) and Website (site). Localize is a row that opens the sheet. Helper paragraphs are gone.
- **Account settings**: Personal information (inline-edit rows, the captured pattern) · Login & security (email, password, Google, device sessions, Delete account at the bottom) · Notifications · Appearance · Log out.
- **Notifications** store a thread id and compose their link at read time (`server/api/dashboard/notifications/index.get.ts`); rows are icon · title · line · relative time.
- Location-only dashboard access is gone (the two production editors are WhatsApp recipients who never sign in). The location inbox is gone.

## Next: every leaf and sheet, against the captures

The owner's words: "some of them are super bad ui/ux, not like airbnb." The captures to hold each one against are in `goal/airbnb/hosting/listings/editor/[listingId]/details/*/index.jpg` (one-field leaves), `goal/airbnb/hosting/account-settings/*/index.jpg` (value rows with inline Edit) and `goal/airbnb-desktop/…` (two-column versions). Airbnb's two shapes:

1. **Editor leaf** (Title, Description, Pricing): one thing, big type, a counter where there is a limit, Cancel and Save, and on a phone it is a sheet with a Close over the list it came from.
2. **Settings leaf** (Personal information): rows of *Label / value / Edit*, expanding in place.

Walk these, in this order, on the phone viewport and at 1280:

| Surface | File | What is wrong today |
|---|---|---|
| Location hub leaves: Name, Description, Hours, Address, Contact, Reservations | `lib/components/workspace/settings/LocationSettingsPage.vue` | Mixed field styles; Hours and Reservations are dense forms with no hierarchy; the sheet has no Close, only Back |
| Location settings: Status, Link, Google Business Profile, WhatsApp number, Features | same file | Same; Features is a raw switch list |
| Brand leaves: name, logo, sharing image, description, colour, font, contact, social | `lib/components/workspace/settings/SiteSettingsPage.vue` | Logo and sharing image open the media picker with no preview of what is set; colour is a picker plus a hex field |
| Website leaves: domain, languages, currency, WhatsApp, search engines, analytics, Facebook, delete | same file + `pages/…/settings/domains.vue` | Languages is a wall of cards; Domains is its own page with a different layout |
| Pages editor and its block editors | `TenantPageEditorPage.vue`, `TenantPageSections.vue`, `TenantPageBlockEditorPage.vue`, `TenantPageBlockItemEditor.vue`, `TenantPageBlockFields.vue`, `TenantPageFieldControl.vue`, `TenantPageGalleryField.vue`, `LinksPageEditor.vue` | Deepest chains in the app (page → sections → section → item); every level draws its own list style |
| Catalog: surfaces, collections, products | `CatalogSurfaceList.vue`, `CollectionList.vue`, `CollectionProductList.vue`, `ProductEditorPage.vue` | Product editor is one long form |
| Posts, Q&A, Reviews | `PostEditorPage.vue`, `QaEditorPage.vue`, `QaList.vue`, `TestimonialList.vue` | Post editor still has guidance paragraphs |
| Blog post editor | `lib/components/workspace/blog/BlogPostEditor.vue` | Block canvas; no autosave (deleted on purpose, MCP is canonical) |
| Messages thread and its details drawer | `lib/components/workspace/messages/GuestThreadDetail.vue`, `GuestThreadConversation.vue` | Compare with Airbnb's inbox thread |
| Today, Calendar, bookings | `TodayPage.vue`, `pages/…/calendar.vue`, `BookingDetails.vue` | Not touched this round |
| Photos | `pages/…/locations/[locationSlug]/photos.vue`, `DashboardPhotoManager.vue` | Compare with Airbnb's Photo tour |

Shared primitives to fix once rather than per page: `EditorNavigationList.vue` (the row list; needs an inline-edit row mode so settings leaves can be the Personal information shape), the pair panels' footer (Cancel/Save), and the phone sheet (a leaf on a phone should be a sheet with Close, per the captures, not a page with Back).

## How the owner works (do not relearn this)

- He watches CI. Push, state what landed, stop. Never poll or loop on a PR.
- No small PRs. One branch, everything in, browser-verified as you go. Commit only after he has looked; push only when he says.
- Deletion first. A refactor deletes what it replaces in the same change. No shims, no fallbacks, no "follow-up".
- Do what a human would do. When a tool fights you (screenshots, tunnels), stop and use the obvious thing. The Airbnb captures came from a phone-width Chrome window plus `screencapture`; the method is in memory.
- Answer the question asked. Check the log before explaining a failure. Never blame his interrupts.
- Production D1 writes are his call; he has approved scoped repairs when the source was fixed in the same change.

## Tooling

- Dev: `preview_start` "dev", sign in at `/api/dev/login`, org `ember-slice-demo`, site `demo`, locations `brooklyn`, `west-village`. The dev server dies now and then; restart it.
- Gates before any push, in this order: `yarn quality`, `test:unit`, `test:d1`, `mcp:catalog`, `chatgpt:submission:check`, `lint:migrations`, `lint:schema-drift`, `test:migrations`. Then `node scripts/coderabbit-gate.mjs review` (3 per hour) on the committed HEAD; the pre-push hook refuses an unreviewed HEAD.
- Capture more Airbnb screens with the AppleScript + Chrome + `screencapture` method (memory: `airbnb-capture-method`); save them into `goal/airbnb/…` with the route as the path.
