# CMS Redesign Design Packet

Reference screenshots for planning the dashboard CMS redesign, captured 2026-08-31 through 2026-09-01. All screenshots were taken at a mobile viewport (~390–420px wide) since mobile-friendliness is the primary driver for this redesign.

**61 CMS screenshots + 30 Airbnb screenshots = 91 total.**

`current/` was derived from the actual Nuxt route tree, the CMS capability registry (`config/cms-registry.ts`), navigation, and dynamic child routes for a restaurant-vertical site, then captured against that manifest — not assembled from what happened to get clicked. See `current/README.md` for the full route→file table, the deliberate org-admin scope boundary, the full privacy-exclusion table, and the one remaining known gap (second location's Settings sub-detail screens). Two routes (`professional-services`, location `experiences`) were confirmed, not assumed, to 404 for this vertical.

`goal/` was derived the same way from Airbnb's own listing-editor navigation, including every field referenced by its overview and hub screens. See `goal/README.md` for the full route→file table and its remaining known gaps (Guest safety sub-children, photo-tour per-room editor, Preferences page, unpublished-listing setup state).

## Folders

- **`current/`** — KrabiClaw dashboard CMS today, organized by route (mirrors the Nuxt `pages/` structure: `[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/...`). Restaurant is Kikuzuki Krabi Thailand.
- **`goal/`** — Airbnb's hosting listing editor, used as the reference for patterns called out as working well: large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.
- **`principles/`** — Descriptive notes on the navigation and layout patterns observed in each, side by side. Not a judgment of "good vs bad" — just what each surface actually does today, as a starting point for redesign discussion.

## How to browse

Each route folder contains an `index.jpg` (or a few named variants where a page has tabs or scroll sections). Folder paths double as breadcrumbs — e.g. `current/sites/[siteSlug]/locations/[locationSlug]/settings/hours/index.jpg` is the Hours screen nested under a specific location's settings.

## Privacy note

No screenshot containing real guest names or reservation details is included in this packet. That covers every inbox and reservation scope that exists in the route tree (org-level inbox, site-level inbox list and thread detail, location-level inbox list and thread detail, location reservations) — none of those were captured, not just the two originally called out.

The impersonated tenant's personal email address was previously included in this README's text and has been removed from the current commit; it is still present in earlier commits on this branch's history. One `goal/` screenshot (Airbnb's own listing) shows a real host's address and photo; that listing belongs to Airbnb's demo/reference account, not a KrabiClaw customer.
