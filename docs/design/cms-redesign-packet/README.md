# CMS Redesign Design Packet

Reference screenshots for planning the dashboard CMS redesign, captured 2026-08-31 through 2026-09-01. All screenshots were taken at a mobile viewport (~390–420px wide) since mobile-friendliness is the primary driver for this redesign.

**Captured: 82 CMS screenshots + 30 Airbnb screenshots = 112.** Every route in `pages/dashboard/**` is now accounted for as captured, privacy-excluded, or a stated blocker with a filed issue — see "Outstanding work" below for the one remaining CMS item and the Airbnb side's gaps.

`current/` was derived from the actual Nuxt route tree (`pages/dashboard/**/*.vue`) and the CMS capability registry (`config/cms-registry.ts`) for a restaurant-vertical site, on **production** (`krabiclaw.com`), impersonating the real Kikuzuki Krabi Thailand tenant — an earlier version of this README wrongly said staging, corrected after checking the actual navigation history. See `current/README.md` for the full route→file table, the privacy-exclusion table (now including the org Members list), and the two production bugs found and filed while capturing.

`goal/` was derived the same way from Airbnb's own listing-editor navigation, including every field referenced by its overview and hub screens. See `goal/README.md` for the full route→file table and its remaining known gaps (Guest safety sub-children, photo-tour per-room editor, Preferences page, unpublished-listing setup state, and the Arrival guide's child editors — check-in method, house manual, Wi-Fi, directions — which were opened during navigation but not individually captured).

## Outstanding work

- **One CMS item blocked, not skipped**: the Menu editor's selected-item edit state can't be captured because the product list itself is currently broken in production for this tenant (issue [#723](https://github.com/paulchrisluke/krabiclaw/issues/723)) — there's nothing to click. Once fixed, this state still needs capturing.
- **Airbnb gaps** (unrelated to any blocker, just not yet done): Guest safety's sub-children, the photo-tour per-room editor, a Preferences/guest-requirements screen, an unpublished-listing setup state, and the Arrival guide's child editors.
- **Two production bugs filed while capturing, unrelated to the redesign**: [#720](https://github.com/paulchrisluke/krabiclaw/issues/720) (Available features 500, both locations) and [#723](https://github.com/paulchrisluke/krabiclaw/issues/723) (Menu editor product list broken, both locations, public storefront unaffected).
- The live test blog post created during capture (`c7854046-70cd-42d3-81ad-fe04afd289dd`) has been deleted and verified 404 — see `current/README.md`.

## Folders

- **`current/`** — KrabiClaw dashboard CMS today, organized by route (mirrors the Nuxt `pages/` structure: `[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/...`). Restaurant is Kikuzuki Krabi Thailand.
- **`goal/`** — Airbnb's hosting listing editor, used as the reference for patterns called out as working well: large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.
- **`principles/`** — Descriptive notes on the navigation and layout patterns observed in each, side by side. Not a judgment of "good vs bad" — just what each surface actually does today, as a starting point for redesign discussion.

## How to browse

Each route folder contains an `index.jpg` (or a few named variants where a page has tabs or scroll sections). Folder paths double as breadcrumbs — e.g. `current/sites/[siteSlug]/locations/[locationSlug]/settings/hours/index.jpg` is the Hours screen nested under a specific location's settings.

## Privacy note

No screenshot containing real guest or team-member personal data is included in this packet. That covers every inbox and reservation scope that exists in the route tree (org-level inbox, site-level inbox list and thread detail, location-level inbox list and thread detail, location reservations), plus the org Settings → Members screen (real team names, emails, and avatars) found in a later pass — none of those were captured.

The impersonated tenant's personal email address was previously included in this README's text and has been removed from the current commit; it is still present in earlier commits on this branch's history. One `goal/` screenshot (Airbnb's own listing) shows a real host's address and photo; that listing belongs to Airbnb's demo/reference account, not a KrabiClaw customer.
