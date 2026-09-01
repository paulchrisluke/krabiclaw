# Current: KrabiClaw Dashboard CMS

All screenshots taken via admin impersonation of a real tenant account, site "Kikuzuki Krabi Thailand" (two locations: Kikuzuki Japanese Robatayaki & Izakaya, Take Me Away by Kikuzuki).

## Viewport

The 2026-09-01 evening batch (everything captured from the second re-login onward — second-location Settings sub-screens, Activity, org Settings, Support, Account, Onboarding, and both Menu-editor error captures) was measured directly: `window.innerWidth` 500, `window.innerHeight` 701, `window.devicePixelRatio` 2. Earlier batches from prior sessions used different browser instances that can't be re-measured retroactively; their own notes describe targeting the same ~500px CSS width, but height and device-pixel-ratio weren't logged for those and aren't independently confirmed. Treat 500×701 CSS px @ 2x as the standard this packet aims for; only the last batch is verified against it.

**Captured: 82 screenshots.** This is the full `pages/dashboard/**` route tree — every route is either captured, excluded for a stated privacy reason, listed as redirect-only with no distinct screen, or listed below as still blocked, with a concrete reason. None are dropped by redefining scope.

## Redirect-only routes (no distinct rendered screen)

| Route | Behavior |
|---|---|
| `/dashboard` | Redirects to `/api/post-login`, which resolves the signed-in user's org/site and forwards to their dashboard home. No screen of its own to capture. |
| `dashboard/[orgSlug]/sites/[siteSlug]/locations` | Redirects to the site overview (`sites/[siteSlug]`) rather than rendering its own list — the Locations list a user actually sees lives on the site overview's "My site" tab, already captured as `sites/[siteSlug]/index-my-site-locations-tab.jpg`. |

## Still blocked — two successful-state screens

| Route | Why it's not yet captured |
|---|---|
| `.../locations/[locationSlug]/products` **selected-item edit state** (both locations) | Cannot currently be captured: the product list itself is broken in production — see the Menu-editor bug below. There is nothing to click. Filed as issue [#723](https://github.com/paulchrisluke/krabiclaw/issues/723); once fixed, this state still needs capturing. |
| `.../locations/[locationSlug]/settings/features` **the actual working Available Features screen** (both locations) | Only the 500 error is captured for each location (issue [#720](https://github.com/paulchrisluke/krabiclaw/issues/720)) — the intended functioning screen (a list of `locationToggleableFeatures` with toggle state) has never been seen or captured. This is not the same thing as the error screenshot; it remains an outstanding capture once #720 is fixed. |

## New production bugs found while capturing — Menu editor

**Working state, captured 2026-09-01 ~20:31 and ~17:42** (`products/index.jpg` for each location): the Menu list rendered normally — 105 products for Kikuzuki Japanese Robatayaki & Izakaya, 75 for Take Me Away by KIKUZUKI.

**Broken state, captured 2026-09-01 ~21:50** (`products/index-error-invalid-url.jpg` for each location): the same route on both locations rendered "No Products published for this location" plus a raw, unformatted client-side error string reading `Invalid URL: /api/editor/sites/site-kikuzuki/locations/loc-kikuzuki/products?org=...&site=...`. The underlying API call actually returns 200 (confirmed via network inspection), so this looks like a client-side URL-construction bug, not a real 404/500.

These two states are **not simultaneous** — the working screenshots and the broken screenshots are roughly 75–140 minutes apart, and two commits landed on this branch in between (`b8e5ef62` "fix(mcp): compact product list responses" at 21:16, `e2e91d3e` "fix: restore Saya product collection styling" at 21:53). It's possible the break was transient and already reverted by the second commit — this was not re-verified before the admin session expired again. **Do not read this packet as showing the Menu editor is currently broken with certainty** — issue [#723](https://github.com/paulchrisluke/krabiclaw/issues/723) is flagged for re-verification. The **public storefront menu was unaffected** throughout — `kikuzuki-thailand.com/menu` rendered correctly during the same window, so if this was a real regression it was confined to the dashboard editor.

## Excluded for privacy (real customer/team data)

No screenshot containing real guest names, messages, reservation details, or team member identities is included. This covers **every** inbox/reservation-scoped route in the tree, plus the org Members list found in this pass:

| Route pattern | Status |
|---|---|
| `dashboard/[orgSlug]` (org Today's "Needs attention" list) | Captured but **redacted** — see `index/today-redacted.jpg`, guest names blacked out |
| `sites/[siteSlug]/inbox` (site-level inbox list) | Not captured — guest names |
| `sites/[siteSlug]/inbox/[threadId]` (site-level thread) | Not captured — guest messages |
| `locations/[locationSlug]/inbox` (both locations) | Not captured — guest names |
| `locations/[locationSlug]/inbox/[threadId]` (both locations) | Not captured — guest messages |
| `locations/[locationSlug]/reservations` (both locations) | Not captured — guest names, party details |
| `dashboard/[orgSlug]/settings/members` | Not captured — the screen is a list of real org team members (6 people) showing full names, personal email addresses, and avatar photos; there's no way to show this screen's actual content without exposing them |

## Known operational side-effect — resolved

Capturing the existing-post blog editor (`blog/[postId]`) required publishing a real test post ("TEST POST delete me") on the live tenant site, per instruction to use synthetic data rather than skip the screen: id `c7854046-70cd-42d3-81ad-fe04afd289dd`, slug `test-post-delete-me`, site `kikuzuki-krabi-thailand` on **production** (`krabiclaw.com`, not staging — see root README's correction).

Deletion via the UI's "Delete post" button first failed 3 times across an earlier session — its native `confirm()` dialog could not be dismissed by that browser-automation tooling (mouse dispatch timed out; Enter-key dispatch, tried once, appeared to time out too). On a later attempt in a fresh page load, clicking Delete then pressing Return succeeded — the dialog was dismissed and the post was removed. **Verified deleted**: the blog list shows "No blog posts yet," and `https://www.kikuzuki-thailand.com/blog/test-post-delete-me` returns a 404.

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
| `.../locations/[locationSlug]/products/index.jpg` | `.../locations/[loc]/products` | Menu, 105 rows, **working state, ~20:31**. Per-item edit form renders off-screen on mobile — bug [#709](https://github.com/paulchrisluke/krabiclaw/issues/709) |
| `.../locations/[locationSlug]/posts/index.jpg` | `.../locations/[loc]/posts` | AI composer + post list |
| `.../locations/[locationSlug]/qa/index.jpg` | `.../locations/[loc]/qa` | Inline add-form pattern |
| `.../locations/[locationSlug]/settings/index.jpg` | `.../locations/[loc]/settings` | Grouped cards: Profile, Hours, Public content, Discovery, Notifications, Available features |
| `.../locations/[locationSlug]/settings/profile/index.jpg` | `.../settings/profile` | Identity/contact fields drill-down |
| `.../locations/[locationSlug]/settings/hours/index.jpg` | `.../settings/hours` | Per-day hours drill-down |
| `.../locations/[locationSlug]/settings/content/index.jpg` | `.../settings/content` | Public-facing description fields |
| `.../locations/[locationSlug]/settings/discovery/index.jpg` | `.../settings/discovery` | Google Places connection drill-down |
| `.../locations/[locationSlug]/settings/notifications/index.jpg` | `.../settings/notifications` | WhatsApp number, timezone |
| `.../locations/[locationSlug]/settings/features/index-error-500.jpg` | `.../settings/features` | **Error state only, ~16:05** — "Available features" throws a 500, filed as issue [#720](https://github.com/paulchrisluke/krabiclaw/issues/720). The working screen is not captured — see "Still blocked" above |
| `.../locations/take-me-away-by-kikuzuki/index-my-location-tab.jpg` | second location — "My location" | Second location's overview (75-product menu, different hours) |
| `.../locations/take-me-away-by-kikuzuki/content-tab.jpg` | second location — "Content" | Content tab for the second location |
| `.../locations/take-me-away-by-kikuzuki/photos/index.jpg` | | Photo grid, different image set |
| `.../locations/take-me-away-by-kikuzuki/products/index.jpg` | | Menu, 75 products (vs. 105 on the first location), **working state, ~17:42** |
| `.../locations/take-me-away-by-kikuzuki/posts/index.jpg` | | Empty-state variant of Posts (no posts yet) |
| `.../locations/take-me-away-by-kikuzuki/qa/index.jpg` | | Empty-state Q&A |
| `.../locations/take-me-away-by-kikuzuki/settings/index.jpg` | | Settings card list for the second location |
| `.../locations/take-me-away-by-kikuzuki/settings/profile/index.jpg` | second location — `.../settings/profile` | Identity/contact fields drill-down, second location |
| `.../locations/take-me-away-by-kikuzuki/settings/hours/index.jpg` | second location — `.../settings/hours` | Per-day hours drill-down, second location |
| `.../locations/take-me-away-by-kikuzuki/settings/content/index.jpg` | second location — `.../settings/content` | Public-facing description fields, second location |
| `.../locations/take-me-away-by-kikuzuki/settings/discovery/index.jpg` | second location — `.../settings/discovery` | Google Places connection, second location — 4.9 rating, 65 reviews |
| `.../locations/take-me-away-by-kikuzuki/settings/notifications/index.jpg` | second location — `.../settings/notifications` | WhatsApp/timezone, second location |
| `.../locations/take-me-away-by-kikuzuki/settings/features/index-error-500.jpg` | second location — `.../settings/features`, **error state only, ~21:40** | Same 500 as the first location — confirms issue [#720](https://github.com/paulchrisluke/krabiclaw/issues/720) isn't location-specific. Working screen not captured here either |
| `.../locations/[locationSlug]/products/index-error-invalid-url.jpg` | `.../products`, **broken state, ~21:50** | Not the intended design — see Menu-editor bugs section above, issue [#723](https://github.com/paulchrisluke/krabiclaw/issues/723), flagged for re-verification |
| `.../locations/take-me-away-by-kikuzuki/products/index-error-invalid-url.jpg` | second location — `.../products`, **broken state, ~21:50** | Same bug, second location |
| `calendar/index.jpg` | `dashboard/[orgSlug]/calendar` | Org-level calendar, empty-state |
| `index/today-redacted.jpg` ⚠️ | `dashboard/[orgSlug]` | Org Today — guest names in "Needs attention" **redacted with black bars** |
| `activity/index.jpg` | `dashboard/[orgSlug]/activity` | Filterable event log (Site/Location/Type/Actor), e.g. "Team member Reordered Products" |
| `settings/index.jpg` | `dashboard/[orgSlug]/settings` | Org Settings hub: General, Appearance, Members, Billing, Analytics under two groups |
| `settings/general/index.jpg` | `.../settings/general` | Org name, your role |
| `settings/appearance/index.jpg` | `.../settings/appearance` | Theme picker: System/Light/Dark |
| `settings/billing/index.jpg` | `.../settings/billing` | Plan, payment method, shared usage credits |
| `settings/analytics/index.jpg` | `.../settings/analytics` | Per-site Google Analytics/Search Console selector |
| `settings/chatgpt/index.jpg` | `.../settings/chatgpt` | MCP server URL for ChatGPT connection |
| `support/index.jpg` | `dashboard/[orgSlug]/support` | "Priority support isn't available yet" empty state |
| `account/index.jpg` | `dashboard/account` | Profile / Authentication list |
| `account/profile/index.jpg` | `dashboard/account/profile` | Display name, email (via Google), phone, delete-account |
| `account/authentication/index.jpg` | `dashboard/account/authentication` | Email/Google/WhatsApp connection rows |
| `onboarding-org/index.jpg` | `dashboard/[orgSlug]/onboarding` | "Your site is ready" welcome + live site preview |
| `onboarding-dashboard/index.jpg` | `dashboard/onboarding` | "Tell me about your business" AI-driven site builder intro |

## Confirmed not applicable to this vertical (not a gap)

- `sites/[siteSlug]/professional-services` — 404 for a restaurant site
- `.../locations/[locationSlug]/experiences.vue` — the page component exists in source and is fully built (list, create/edit slideover, availability manager), gated behind `definePageMeta({ cmsCapabilityKey: 'location.experiences' })`. `config/cms-registry.ts`'s `verticalDefaultFeatures.restaurant = ['products', 'reservations', 'ordering']` does not include `experiences`, so the capability guard 404s it for this vertical — confirmed by reading the gating source, not just by observing the 404.

## What this shows

- **Settings-style surfaces** (Site Settings, Location Settings, Brand, and the third-level "Search and analytics" drill-down) share a navigational shape with the Airbnb reference: card list → single-field screen → bottom Cancel/Save bar. This is a *structural* match only — visually these are dense, icon-free text rows, not the larger icon-led, more spaced-out cards Airbnb uses. Don't read "same shape" as "looks the same."
- **The actual page content editor** (`pages/[pageId]`) is the biggest contrast point with Airbnb: title, description, and every content block live on one continuous scrolling page, with rich text fields expanding in place rather than opening their own screen.
- **The Blog post editor** is the current CMS's own closest match to the Airbnb pattern already: full-screen, minimal-chrome writing surface with metadata pushed into a slideover.
- **Several "add" flows put the form inline on the list screen** rather than a separate screen: Q&A (both site- and location-level), Testimonials, Links.
- **Two real production bugs** were found and filed while capturing, unrelated to the redesign itself: Location Settings → Available features throws a 500 on both locations, confirmed reproducible ([#720](https://github.com/paulchrisluke/krabiclaw/issues/720)); the Menu editor's product list broke on both locations with a raw error string surfaced to the user, but the timing lines up closely with a same-day deploy and revert, so it's flagged for re-verification rather than confirmed still-broken ([#723](https://github.com/paulchrisluke/krabiclaw/issues/723)). Both bugs leave one CMS screen each un-capturable in its intended working state: the Available Features screen, and the Menu editor's selected-item edit form.
