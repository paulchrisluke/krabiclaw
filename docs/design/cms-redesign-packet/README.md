# CMS Redesign Design Packet

Reference screenshots for planning the dashboard CMS redesign, captured 2026-08-31 through 2026-09-01. All screenshots were taken at a mobile viewport (~390–420px wide) since mobile-friendliness is the primary driver for this redesign.

**Captured so far: 61 CMS screenshots + 30 Airbnb screenshots = 91.** This is not the full manifest — see "Outstanding work" below and each folder's README for exactly what's still missing and why.

`current/` was derived from the actual Nuxt route tree (`pages/dashboard/**/*.vue`) and the CMS capability registry (`config/cms-registry.ts`) for a restaurant-vertical site. See `current/README.md` for the full route→file table, the full privacy-exclusion table, and the inaccessible-routes table (16 org-level/account/second-location/Menu-editor screens blocked on a re-login, not excluded by scope).

`goal/` was derived the same way from Airbnb's own listing-editor navigation, including every field referenced by its overview and hub screens. See `goal/README.md` for the full route→file table and its remaining known gaps (Guest safety sub-children, photo-tour per-room editor, Preferences page, unpublished-listing setup state, and the Arrival guide's child editors — check-in method, house manual, Wi-Fi, directions — which were opened during navigation but not individually captured).

## Outstanding work (not done — do not read this packet as complete)

**Correction:** every route in this packet is on **production** (`krabiclaw.com`), impersonating the real Kikuzuki Krabi Thailand tenant. An earlier version of this README wrongly said `staging.krabiclaw.com` — that was never checked against the actual navigation history and was incorrect. There is no staging equivalent of this tenant; all screenshots and any account impersonation described here are against the live production system.

- ~~A live test blog post was still published on the real tenant site~~ — **resolved**: `c7854046-70cd-42d3-81ad-fe04afd289dd` (slug `test-post-delete-me`) has been deleted and verified 404 on its public URL. See `current/README.md`.
- 16 CMS routes/states not yet captured: `activity`, 6 org Settings screens, Support, 2 onboarding screens, 3 account screens, the second location's 6 Settings sub-screens, and the Menu editor's selected-item edit state.
- Airbnb: Guest safety's sub-children, the photo-tour per-room editor, a Preferences/guest-requirements screen, an unpublished-listing setup state, and the Arrival guide's child editors.
- Issue [#720](https://github.com/paulchrisluke/krabiclaw/issues/720) filed for a reproducible 500 at Location Settings → Available features.

## Folders

- **`current/`** — KrabiClaw dashboard CMS today, organized by route (mirrors the Nuxt `pages/` structure: `[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/...`). Restaurant is Kikuzuki Krabi Thailand.
- **`goal/`** — Airbnb's hosting listing editor, used as the reference for patterns called out as working well: large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.
- **`principles/`** — Descriptive notes on the navigation and layout patterns observed in each, side by side. Not a judgment of "good vs bad" — just what each surface actually does today, as a starting point for redesign discussion.

## How to browse

Each route folder contains an `index.jpg` (or a few named variants where a page has tabs or scroll sections). Folder paths double as breadcrumbs — e.g. `current/sites/[siteSlug]/locations/[locationSlug]/settings/hours/index.jpg` is the Hours screen nested under a specific location's settings.

## Privacy note

No screenshot containing real guest names or reservation details is included in this packet. That covers every inbox and reservation scope that exists in the route tree (org-level inbox, site-level inbox list and thread detail, location-level inbox list and thread detail, location reservations) — none of those were captured, not just the two originally called out.

The impersonated tenant's personal email address was previously included in this README's text and has been removed from the current commit; it is still present in earlier commits on this branch's history. One `goal/` screenshot (Airbnb's own listing) shows a real host's address and photo; that listing belongs to Airbnb's demo/reference account, not a KrabiClaw customer.
