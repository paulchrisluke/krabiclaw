# CMS Redesign Design Packet

Reference screenshots for planning the dashboard CMS redesign, captured 2026-08-31 through 2026-09-01.

**Captured: 82 CMS screenshots + 48 Airbnb screenshots = 130.** Every requested Airbnb screen has been captured, and every CMS route is captured, privacy-excluded, redirect-only, or a stated blocker with a filed issue.

`current/` was derived from the actual Nuxt route tree (`pages/dashboard/**/*.vue`) and the CMS capability registry (`config/cms-registry.ts`) for a restaurant-vertical site, on **production** (`krabiclaw.com`), impersonating the real Kikuzuki Krabi Thailand tenant — an earlier version of this README wrongly said staging, corrected after checking the actual navigation history. See `current/README.md` for the full route→file table, the privacy-exclusion table (including the org Members list), the two redirect-only routes with no distinct screen, and the two production bugs found while capturing.

`goal/` was derived the same way from Airbnb's own listing-editor navigation, including every field referenced by its overview and hub screens: Arrival guide's full set of child editors (Check-in & checkout, Directions, Check-in method, Wi-Fi details, House manual), Guest safety's 3 child editors, a Photo tour room/caption editor, Preferences and Guest requirements, and an authorized incomplete-listing/Unlisted state. See `goal/README.md` for the full route→file table and the viewport verification note.

## Outstanding work

- **Two CMS successful-state screens blocked, not skipped**: the Menu editor's selected-item edit form, and the Available Features screen's actual working state (only its 500 error is captured). Both are blocked on the same two filed issues — see `current/README.md`.
- **Two production bugs filed while capturing, unrelated to the redesign**: [#720](https://github.com/paulchrisluke/krabiclaw/issues/720) (Available features 500, confirmed on both locations) and [#723](https://github.com/paulchrisluke/krabiclaw/issues/723) (Menu editor product list broke on both locations — timing suggests this may already be fixed by a same-day revert; flagged for re-verification, not confirmed still-broken).
- The live test blog post created during capture (`c7854046-70cd-42d3-81ad-fe04afd289dd`) has been deleted and verified 404 — see `current/README.md`.

## Viewport

The most recent capture batch (everything from the 2026-09-01 evening re-login onward, both CMS and Airbnb) was measured directly at CSS 500×701, device pixel ratio 2. Earlier batches from separate browser sessions can't be re-measured retroactively; see `current/README.md` and `goal/README.md` for what's independently verified versus assumed consistent.

## Folders

- **`current/`** — KrabiClaw dashboard CMS today, organized by route (mirrors the Nuxt `pages/` structure: `[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/...`). Restaurant is Kikuzuki Krabi Thailand.
- **`goal/`** — Airbnb's hosting listing editor, used as the reference for patterns called out as working well: large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.
- **`principles/`** — Descriptive notes on the navigation and layout patterns observed in each, side by side. Not a judgment of "good vs bad" — just what each surface actually does today, as a starting point for redesign discussion.

## How to browse

Each route folder contains an `index.jpg` (or a few named variants where a page has tabs or scroll sections). Folder paths double as breadcrumbs — e.g. `current/sites/[siteSlug]/locations/[locationSlug]/settings/hours/index.jpg` is the Hours screen nested under a specific location's settings.

## Privacy note

No screenshot containing real guest or team-member personal data is included in this packet. That covers every inbox and reservation scope that exists in the route tree (org-level inbox, site-level inbox list and thread detail, location-level inbox list and thread detail, location reservations), plus the org Settings → Members screen (real team names, emails, and avatars) found in a later pass — none of those were captured.

The impersonated tenant's personal email address was previously included in this README's text and has been removed from the current commit; it is still present in earlier commits on this branch's history. One `goal/` screenshot (Airbnb's own listing) shows a real host's address and photo; that listing belongs to Airbnb's demo/reference account, not a KrabiClaw customer.
