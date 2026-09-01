# Current: KrabiClaw Dashboard CMS

All screenshots taken via admin impersonation of a real tenant account, site "Kikuzuki Krabi Thailand" (two locations: Kikuzuki Japanese Robatayaki & Izakaya, Take Me Away by Kikuzuki). Mobile viewport (~390–500px wide).

**Captured: 61 screenshots. Expected (full route tree, every `pages/dashboard/**/*.vue` file): 75+ distinct routes/states — see the inaccessible list below for what's still outstanding and why.**

This is the full `pages/dashboard/**` route tree, not a redefined subset. Every route below is either captured, excluded for a stated privacy reason, or listed as inaccessible with a concrete blocker — none are dropped by redefining scope.

## Inaccessible — blocked, not excluded

The admin-impersonation browser session used for every capture in this packet expired mid-task and could not be resumed: this tooling cannot enter a password or complete an interactive Google/OAuth sign-in on the user's behalf. Every route below still needs to be captured once a human re-authenticates the session; none of these were judged out of scope.

| Route | Why it's not yet captured |
|---|---|
| `dashboard/[orgSlug]/activity.vue` (Activity — filters + event history) | Session expired before this route was visited. Real repo route, not previously in this manifest — added here per audit. |
| `dashboard/[orgSlug]/settings/{members,billing,general,analytics,appearance,chatgpt}.vue` (6 screens) | Session expired before these were visited |
| `dashboard/[orgSlug]/support.vue` | Session expired before this was visited |
| `dashboard/[orgSlug]/onboarding.vue`, `dashboard/onboarding.vue` | Session expired before these were visited |
| `dashboard/account/{index,profile,authentication}.vue` (3 screens) | Session expired before these were visited |
| `.../locations/[locationSlug]/products` **selected-item edit state** (both locations) | The list is captured; the per-item edit form (confirmed in source to exist — see bug [#709](https://github.com/paulchrisluke/krabiclaw/issues/709)) renders off-screen below a 105-row list on mobile and was never captured in its opened state, only inferred from source |
| `.../locations/take-me-away-by-kikuzuki/settings/{profile,hours,content,discovery,notifications,features}` (6 screens) | Only the Settings index was captured for the second location before the session expired |

These are genuine blockers pending a human re-login, not decisions made on this packet's behalf.

## Excluded for privacy (real customer data)

No screenshot containing real guest names, messages, or reservation details is included. This covers **every** inbox/reservation-scoped route in the tree, not just the two originally flagged:

| Route pattern | Status |
|---|---|
| `dashboard/[orgSlug]` (org Today's "Needs attention" list) | Captured but **redacted** — see `index/today-redacted.jpg`, guest names blacked out |
| `sites/[siteSlug]/inbox` (site-level inbox list) | Not captured — guest names |
| `sites/[siteSlug]/inbox/[threadId]` (site-level thread) | Not captured — guest messages |
| `locations/[locationSlug]/inbox` (both locations) | Not captured — guest names |
| `locations/[locationSlug]/inbox/[threadId]` (both locations) | Not captured — guest messages |
| `locations/[locationSlug]/reservations` (both locations) | Not captured — guest names, party details |

## Known operational side-effect — live tenant mutation not yet cleaned up

Capturing the existing-post blog editor (`blog/[postId]`) required publishing a real test post ("TEST POST delete me") on the live tenant site, per instruction to use synthetic data rather than skip the screen. **It is still published**: id `c7854046-70cd-42d3-81ad-fe04afd289dd`, slug `test-post-delete-me`, site `kikuzuki-krabi-thailand`.

Deletion via the UI's "Delete post" button was attempted and failed 3 times — its native `confirm()` dialog could not be dismissed by this browser-automation tooling (mouse and Enter-key dispatch both timed out). The endpoint backing that button is `DELETE /api/editor/sites/{siteId}/blog/{postId}` (`server/api/editor/sites/[siteId]/blog/[postId].delete.ts`), an ordinary authenticated request — bypassing the `confirm()` dialog by calling it directly (e.g. `dashboardApi(...)` from the authenticated page, or `window.confirm = () => true` before clicking Delete) does not require any new mechanism. This was not attempted before the admin session expired; **it remains outstanding** and needs a human (or the next session, once re-authenticated) to run it and verify via the public blog URL that the post is gone.

## Route → file table

| Screenshot | Route | What's on screen |
|---|---|---|
| `sites/index.jpg` | `/sites` | Sites list — large photo cards |
| `sites/new/index.jpg` | `/sites/new` | Add-a-site form (name, subdomain, vertical) |
| `sites/[siteSlug]/index-my-site-locations-tab.jpg` | `/sites/[site]` — "My site" tab | Locations list, large photo cards |
| `sites/[siteSlug]/index-pages-tab.jpg` | same — "Pages" tab | Feature-nav icon list (About, Home, Products, Order online, Experiences, Reservations, Blog), some grayed out for this vertical |
| `sites/[siteSlug]/pages/index.jpg` | `/sites/[site]/pages` | The actual **Pages** management list (Home, About Us) — distinct from the "Pages" tab above |
| `sites/[siteSlug]/pages/new/index.jpg` | `/sites/[site]/pages/new` | Empty new-page editor (title, description, no sections yet) |
| `sites/[siteSlug]/pages/[pageId]/index-top.jpg` | `/sites/[site]/pages/[pageId]` (About Us) | **The page content editor.** Title + description fields, then a block list (Hero, Heading, Rich text ×2, Image, …) — everything on one continuous scroll |
| `sites/[siteSlug]/pages/[pageId]/index-collapsed-blocks.jpg` | same, scrolled | Block list collapsed, each with reorder/duplicate/delete controls |
| `sites/[siteSlug]/pages/[pageId]/index-rich-text-expanded.jpg` | same, one block expanded | A Rich text block expands in place into a textarea, still stacked among sibling blocks — closest current-CMS contrast to Airbnb's per-field screens |
| `sites/[siteSlug]/settings/index.jpg` | `/sites/[site]/settings` | Site Settings — grouped cards |
| `sites/[siteSlug]/settings/localization/index.jpg` | `.../settings/localization` | Single-field drill-down, Cancel/Save bar |
| `sites/[siteSlug]/settings/currency/index.jpg` | `.../settings/currency` | Single-field drill-down |
| `sites/[siteSlug]/settings/notifications/index.jpg` | `.../settings/notifications` | Single-field drill-down |
| `sites/[siteSlug]/settings/publishing/index.jpg` | `.../settings/publishing` | Facebook connection drill-down |
| `sites/[siteSlug]/settings/search/index.jpg` | `.../settings/search` | Third-level hub: Google Analytics / Search verification / Search visibility |
| `sites/[siteSlug]/settings/search/analytics/index.jpg` | `.../settings/search/analytics` | Google Analytics measurement ID field |
| `sites/[siteSlug]/settings/search/verification/index.jpg` | `.../settings/search/verification` | Search Console token field |
| `sites/[siteSlug]/settings/search/visibility/index.jpg` | `.../settings/search/visibility` | Search-engine visibility toggle |
| `sites/[siteSlug]/analytics/index.jpg` | `/sites/[site]/analytics` | Analytics dashboard: date range, canonical-history notice |
| `sites/[siteSlug]/domains/index.jpg` | `/sites/[site]/domains` | Domains list, status badges |
| `sites/[siteSlug]/conversations/index.jpg` | `/sites/[site]/conversations` ("Assistant") | ChowBot conversation list |
| `sites/[siteSlug]/conversations/[conversationId]/index.jpg` | `.../conversations/[id]` | Chat thread with tool-call result cards |
| `sites/[siteSlug]/media/index.jpg` | `/sites/[site]/media` | Site-wide media library, upload zone + grid |
| `sites/[siteSlug]/orders/index.jpg` | `/sites/[site]/orders` | Delivery platform links (Grab, Uber Eats, Foodpanda) per location |
| `sites/[siteSlug]/qa/index.jpg` | `/sites/[site]/qa` | Site-level Q&A, inline add-form pattern |
| `sites/[siteSlug]/links/index.jpg` | `/sites/[site]/links` | Link-in-bio page: page details form + links list, one screen |
| `sites/[siteSlug]/testimonials/index.jpg` | `/sites/[site]/testimonials` | Empty-state list + inline add-form |
| `sites/[siteSlug]/brand/index.jpg` | `/sites/[site]/brand` | Brand card list (name, logo, description, color, contact, social) |
| `sites/[siteSlug]/brand/name/index.jpg` | `.../brand/name` | Single-field drill-down |
| `sites/[siteSlug]/brand/logo/index.jpg` | `.../brand/logo` | Logo picker drill-down |
| `sites/[siteSlug]/brand/description/index.jpg` | `.../brand/description` | Textarea drill-down |
| `sites/[siteSlug]/brand/color/index.jpg` | `.../brand/color` | Color picker drill-down |
| `sites/[siteSlug]/brand/contact/index.jpg` | `.../brand/contact` | Contact email field |
| `sites/[siteSlug]/brand/social/index.jpg` | `.../brand/social` | Facebook/Instagram/TikTok fields |
| `sites/[siteSlug]/blog/index.jpg` | `/sites/[site]/blog` | Blog post list |
| `sites/[siteSlug]/blog/new/index.jpg` | `/sites/[site]/blog/new` | **Full-screen distraction-free article editor** — closest current-CMS match to the Airbnb feel |
| `sites/[siteSlug]/blog/new/settings-slideover.jpg` | same, settings open | Category/Tags/Excerpt/Publishing in a slideover, off the writing surface |
| `sites/[siteSlug]/blog/[postId]/index.jpg` | `/sites/[site]/blog/[id]` | Existing-post editor ("Save live changes" replaces "Publish now") — see operational note above |
| `sites/[siteSlug]/locations/new/index.jpg` | `/sites/[site]/locations/new` | Wide split-view "add a location" wizard (Google-import flow) |
| `.../locations/[locationSlug]/index-my-location-tab.jpg` | `.../locations/[loc]` — "My location" | Photo card + Guest activity/Hours/Discovery cards (Kikuzuki Japanese Robatayaki) |
| `.../locations/[locationSlug]/content-tab.jpg` | same — "Content" tab | Photos/Menu/Posts/Q&A cards + Reservations |
| `.../locations/[locationSlug]/photos/index.jpg` | `.../locations/[loc]/photos` | Photo grid |
| `.../locations/[locationSlug]/products/index.jpg` | `.../locations/[loc]/products` | Menu, 105 rows. Per-item edit form renders off-screen on mobile — bug [#709](https://github.com/paulchrisluke/krabiclaw/issues/709) |
| `.../locations/[locationSlug]/posts/index.jpg` | `.../locations/[loc]/posts` | AI composer + post list |
| `.../locations/[locationSlug]/qa/index.jpg` | `.../locations/[loc]/qa` | Inline add-form pattern |
| `.../locations/[locationSlug]/settings/index.jpg` | `.../locations/[loc]/settings` | Grouped cards: Profile, Hours, Public content, Discovery, Notifications, Available features |
| `.../locations/[locationSlug]/settings/profile/index.jpg` | `.../settings/profile` | Identity/contact fields drill-down |
| `.../locations/[locationSlug]/settings/hours/index.jpg` | `.../settings/hours` | Per-day hours drill-down |
| `.../locations/[locationSlug]/settings/content/index.jpg` | `.../settings/content` | Public-facing description fields |
| `.../locations/[locationSlug]/settings/discovery/index.jpg` | `.../settings/discovery` | Google Places connection drill-down |
| `.../locations/[locationSlug]/settings/notifications/index.jpg` | `.../settings/notifications` | WhatsApp number, timezone |
| `.../locations/[locationSlug]/settings/features/index-error-500.jpg` | `.../settings/features` | **Reproducible server error** (confirmed twice) — "Available features" throws a 500, filed as issue [#720](https://github.com/paulchrisluke/krabiclaw/issues/720) |
| `.../locations/take-me-away-by-kikuzuki/index-my-location-tab.jpg` | second location — "My location" | Second location's overview (75-product menu, different hours) |
| `.../locations/take-me-away-by-kikuzuki/content-tab.jpg` | second location — "Content" | Content tab for the second location |
| `.../locations/take-me-away-by-kikuzuki/photos/index.jpg` | | Photo grid, different image set |
| `.../locations/take-me-away-by-kikuzuki/products/index.jpg` | | Menu, 75 products (vs. 105 on the first location) |
| `.../locations/take-me-away-by-kikuzuki/posts/index.jpg` | | Empty-state variant of Posts (no posts yet) |
| `.../locations/take-me-away-by-kikuzuki/qa/index.jpg` | | Empty-state Q&A |
| `.../locations/take-me-away-by-kikuzuki/settings/index.jpg` | | Settings card list for the second location |
| `calendar/index.jpg` | `dashboard/[orgSlug]/calendar` | Org-level calendar, empty-state |
| `index/today-redacted.jpg` ⚠️ | `dashboard/[orgSlug]` | Org Today — guest names in "Needs attention" **redacted with black bars** |

## Confirmed not applicable to this vertical (not a gap)

- `sites/[siteSlug]/professional-services` — 404 for a restaurant site
- `.../locations/[locationSlug]/experiences.vue` — the page component exists in source and is fully built (list, create/edit slideover, availability manager), gated behind `definePageMeta({ cmsCapabilityKey: 'location.experiences' })`. `config/cms-registry.ts`'s `verticalDefaultFeatures.restaurant = ['products', 'reservations', 'ordering']` does not include `experiences`, so the capability guard 404s it for this vertical — confirmed by reading the gating source, not just by observing the 404.

## What this shows

- **Settings-style surfaces** (Site Settings, Location Settings, Brand, and the third-level "Search and analytics" drill-down) share a navigational shape with the Airbnb reference: card list → single-field screen → bottom Cancel/Save bar. This is a *structural* match only — visually these are dense, icon-free text rows, not the larger icon-led, more spaced-out cards Airbnb uses. Don't read "same shape" as "looks the same."
- **The actual page content editor** (`pages/[pageId]`) is the biggest contrast point with Airbnb: title, description, and every content block live on one continuous scrolling page, with rich text fields expanding in place rather than opening their own screen.
- **The Blog post editor** is the current CMS's own closest match to the Airbnb pattern already: full-screen, minimal-chrome writing surface with metadata pushed into a slideover.
- **Several "add" flows put the form inline on the list screen** rather than a separate screen: Q&A (both site- and location-level), Testimonials, Links.
- **A real, reproducible server bug** exists at Location Settings → Available features (500 error, confirmed twice) — worth filing separately from this packet's redesign scope.
