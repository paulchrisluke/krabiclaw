# CMS Redesign Design Packet

Reference screenshots for planning the dashboard CMS redesign, captured 2026-08-31 through 2026-09-01. All screenshots were taken at a mobile viewport (~390–420px wide) since mobile-friendliness is the primary driver for this redesign.

`current/` is a full sweep of every dashboard route reachable for a restaurant-vertical site (site-level: Sites, Site overview/Pages/Settings, Pages management + the actual page content editor, Analytics, Domains, Assistant, Media, Orders, Q&A, Links, Testimonials, Brand, Blog; location-level: Locations overview/Content, Photos, Menu, Posts, Q&A, Reservations, Settings). Two routes (`professional-services`, location `experiences`) 404 for this vertical and are confirmed not applicable, not missed.

## Folders

- **`current/`** — KrabiClaw dashboard CMS today, organized by route (mirrors the Nuxt `pages/` structure: `[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/...`). Restaurant is Kikuzuki Krabi Thailand.
- **`goal/`** — Airbnb's hosting listing editor, used as the reference for patterns called out as working well: large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.
- **`principles/`** — Descriptive notes on the navigation and layout patterns observed in each, side by side. Not a judgment of "good vs bad" — just what each surface actually does today, as a starting point for redesign discussion.

## How to browse

Each route folder contains an `index.jpg` (or a few named variants where a page has tabs or scroll sections). Folder paths double as breadcrumbs — e.g. `current/sites/[siteSlug]/locations/[locationSlug]/settings/hours/index.jpg` is the Hours screen nested under a specific location's settings.

## Privacy note

Screenshots of the guest inbox and reservations list (real guest names, reservation details — live production data viewed via admin impersonation of the tenant) were deliberately left out of this packet; see `current/README.md` for the routes they'd have covered. One `goal/` screenshot (Airbnb's own listing) shows a real host's address and photo; that listing belongs to Airbnb's demo/reference account, not a KrabiClaw customer.
