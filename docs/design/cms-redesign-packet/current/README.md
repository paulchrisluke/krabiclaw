# Current: KrabiClaw Dashboard CMS

All screenshots taken via admin impersonation of a real tenant account, site "Kikuzuki Krabi Thailand" (two locations: Kikuzuki Japanese Robatayaki & Izakaya, Take Me Away by Kikuzuki). Mobile viewport, Kikuzuki Japanese Robatayaki & Izakaya location only — Take Me Away by Kikuzuki was not separately captured.

This covers the routes walked during two capture passes, not a verified-complete route sweep. Known gaps as of this commit: `new`/create screens (site, location, page), existing-post blog editor (only `/blog/new` was captured), conversation detail, org-level Today/Calendar, several Brand/Settings sub-detail screens (Currency, Facebook publishing, Google Analytics, Search verification, Search visibility, Public content, Available features), and the second location. `professional-services` and location `experiences` routes were confirmed (not assumed) to 404 for this vertical.

## Site-level routes

| Screenshot | Route | What's on screen |
|---|---|---|
| `sites/index.jpg` | `/dashboard/[org]/sites` | Sites list — one large card per site (photo + name) |
| `sites/[siteSlug]/index-my-site-locations-tab.jpg` | `/dashboard/[org]/sites/[site]` — "My site" tab | Site overview: Locations list as large photo cards |
| `sites/[siteSlug]/index-pages-tab.jpg` | same route — "Pages" tab | Icon-led list of site *features* (About, Home, Products, Order online, Experiences, Reservations, Blog) — a mix of real pages and other feature areas, grayed out where not available for this vertical |
| `sites/[siteSlug]/pages/index.jpg` | `/dashboard/[org]/sites/[site]/pages` | The actual **Pages** management list (Home, About Us) — distinct from the "Pages" tab above, which is a broader feature-nav, not a page list |
| `sites/[siteSlug]/pages/[pageId]/index-top.jpg` | `/dashboard/[org]/sites/[site]/pages/[pageId]` | **The page content editor** (opened on "About Us"). Page title + short description fields, then a "Page sections" block list (Hero, Heading, Rich text ×2, Image, …) — everything for the page lives on one continuous scrolling screen |
| `sites/[siteSlug]/pages/[pageId]/index-collapsed-blocks.jpg` | same route, scrolled | The block list collapsed — each block shows a type label + one-line preview, with reorder/duplicate/delete controls inline |
| `sites/[siteSlug]/pages/[pageId]/index-rich-text-expanded.jpg` | same route, one block expanded | Clicking a Rich text block expands it in place into a large textarea, still on the same page, stacked among the other blocks — this is the "one big page with everything" pattern, closest direct contrast to the Airbnb reference |
| `sites/[siteSlug]/settings/index.jpg` | `/dashboard/[org]/sites/[site]/settings` | Site Settings — grouped cards (Domain, Localization, Currency, Notifications, Search & analytics, Facebook publishing) |
| `sites/[siteSlug]/settings/localization/index.jpg` | `.../settings/localization` | Single-field drill-down: language list, Cancel/Save bar |
| `sites/[siteSlug]/settings/notifications/index.jpg` | `.../settings/notifications` | Single-field drill-down: alert channel + site-wide WhatsApp number, Cancel/Save bar |
| `sites/[siteSlug]/settings/search/index.jpg` | `.../settings/search` | A **third level** of drill-down: "Search and analytics" itself opens into its own sub-list (Google Analytics, Search verification, Search visibility) before reaching an actual field |
| `sites/[siteSlug]/analytics/index.jpg` | `/dashboard/[org]/sites/[site]/analytics` | Analytics dashboard: date range picker, canonical-history notice, attribution section below the fold |
| `sites/[siteSlug]/domains/index.jpg` | `/dashboard/[org]/sites/[site]/domains` | Domains list — one card per domain, status badge, overflow menu |
| `sites/[siteSlug]/conversations/index.jpg` | `/dashboard/[org]/sites/[site]/conversations` ("Assistant" in nav) | ChowBot AI assistant — list of past conversations, "New conversation" action |
| `sites/[siteSlug]/media/index.jpg` | `/dashboard/[org]/sites/[site]/media` | Site-wide media library — drag/drop upload zone + thumbnail grid, filter by All/Images/Videos |
| `sites/[siteSlug]/orders/index.jpg` | `/dashboard/[org]/sites/[site]/orders` | Delivery platform links (Grab, Uber Eats, Foodpanda) per location, all on one screen |
| `sites/[siteSlug]/qa/index.jpg` | `/dashboard/[org]/sites/[site]/qa` | Site-level Q&A — same inline list + "Add Q&A" form pattern as the location-level Q&A |
| `sites/[siteSlug]/links/index.jpg` | `/dashboard/[org]/sites/[site]/links` | Link-in-bio style page: Page details form (title, robots, SEO) and the Links list, both on one screen |
| `sites/[siteSlug]/testimonials/index.jpg` | `/dashboard/[org]/sites/[site]/testimonials` | Testimonials — empty-state list + inline "Add testimonial" form (reviewer, rating, title, text) |
| `sites/[siteSlug]/brand/index.jpg` | `/dashboard/[org]/sites/[site]/brand` | Brand — card list (Brand name, Logo, Description, Brand color, Contact details, Social profiles), same pattern as Settings |
| `sites/[siteSlug]/blog/index.jpg` | `/dashboard/[org]/sites/[site]/blog` | Blog post list (empty state + "New Post") |
| `sites/[siteSlug]/blog/new/index.jpg` | `/dashboard/[org]/sites/[site]/blog/new` | **Full-screen distraction-free article editor** — large title, Markdown body, minimal chrome. Closest match in the whole current CMS to the Airbnb reference's "one thing, full screen" feel |
| `sites/[siteSlug]/blog/new/settings-slideover.jpg` | same route, settings panel open | Category/Tags/Excerpt/Publishing metadata tucked into a slideover, kept off the main writing surface |

## Location-level routes (Kikuzuki Japanese Robatayaki & Izakaya)

| Screenshot | Route | What's on screen |
|---|---|---|
| `.../locations/[locationSlug]/index-my-location-tab.jpg` | `.../locations/[loc]` — "My location" tab | Photo card + Guest activity / Hours / Discovery cards |
| `.../locations/[locationSlug]/content-tab.jpg` | same route — "Content" tab | Photos, Menu, Posts, Q&A cards, plus a "Manage" section (Reservations) |
| `.../locations/[locationSlug]/photos/index.jpg` | `.../locations/[loc]/photos` | Photo grid (3-column), tap-to-tag, upload/attach-existing |
| `.../locations/[locationSlug]/products/index.jpg` | `.../locations/[loc]/products` | Menu list — 105 flat rows. Per-item edit form renders off-screen below the full list on mobile — bug, filed as [#709](https://github.com/paulchrisluke/krabiclaw/issues/709) |
| `.../locations/[locationSlug]/posts/index.jpg` | `.../locations/[loc]/posts` | AI composer card at top, list of posts below |
| `.../locations/[locationSlug]/qa/index.jpg` | `.../locations/[loc]/qa` | Empty state + inline "Add Q&A" form on the same screen |
| `.../locations/[locationSlug]/reservations/index.jpg` ⚠️ | `.../locations/[loc]/reservations` | Not included — real guest PII |
| `.../locations/[locationSlug]/inbox/index.jpg` ⚠️ | `.../locations/[loc]/inbox` | Not included — real guest PII |
| `.../locations/[locationSlug]/settings/index.jpg` | `.../locations/[loc]/settings` | Grouped cards: Profile, Hours, Public content, Discovery, Notifications, Available features |
| `.../locations/[locationSlug]/settings/profile/index.jpg` | `.../settings/profile` | Single-field drill-down: all identity/contact fields, Cancel/Save bar |
| `.../locations/[locationSlug]/settings/hours/index.jpg` | `.../settings/hours` | Single-field drill-down: per-day open/close times, Cancel/Save bar |
| `.../locations/[locationSlug]/settings/discovery/index.jpg` | `.../settings/discovery` | Single-field drill-down: Google Places connection, rating, Place ID, Maps URL |
| `.../locations/[locationSlug]/settings/notifications/index.jpg` | `.../settings/notifications` | Single-field drill-down: WhatsApp number, timezone |

## Not applicable to this vertical (confirmed, not a gap)

- `sites/[siteSlug]/professional-services` — 404 for a restaurant site
- `.../locations/[loc]/experiences` — 404 for a restaurant site

## What this shows

- **Settings-style surfaces** (Site Settings, Location Settings, Brand, and the third-level "Search and analytics" drill-down) share a navigational shape with the Airbnb reference: card list → single-field screen → bottom Cancel/Save bar. This is a *structural* match only — visually these are dense, icon-free text rows, not the larger icon-led, more spaced-out cards Airbnb uses. Don't read "same shape" as "looks the same."
- **The actual page content editor** (`pages/[pageId]`) is the biggest contrast point with Airbnb: title, description, and every content block (Hero, Heading, Rich text, Image, …) live on one continuous scrolling page, with rich text fields expanding in place rather than opening their own screen.
- **The Blog post editor** is the current CMS's own closest match to the Airbnb pattern already: full-screen, minimal-chrome writing surface with metadata pushed into a slideover. Worth studying as an internal reference alongside Settings.
- **Several "add" flows put the form inline on the list screen** rather than a separate screen: Q&A (both site- and location-level), Testimonials, Links. Consistent pattern worth addressing as one decision, not one-by-one.
