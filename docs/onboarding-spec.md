# Onboarding Spec — Site-Level vs Location-Level, Sequence, and Content State

> **Status key used throughout this document:**
> - **Current** — true today, mechanically checkable against the code cited.
> - **Resolved** — was a real gap when originally written; fixed since, kept here only as dated history so the fix isn't rediscovered as a "new" finding.
> - **Deferred** — a known, real gap, intentionally not fixed yet, with a linked tracking issue.
>
> This document previously mixed current-state description, resolved bug writeups, and open product questions with no way to tell which was which — see #277 (onboarding architecture cleanup), which added these markers and reconciled every claim below against the code as of that issue.

## Principle

Global first, local second, persistent after that.

- **Site/org level** (once per site): brand, currency, timezone default, team, ChatGPT app, socials, core offering.
- **Location level** (once per location, repeats on every new location): hours, contact, notification destination, location hero/media, location-specific copy.
- Onboarding is not a single linear wizard that ends at "Create site." The wizard collects the first handful of critical steps; everything else surfaces as a **persistent adaptive checklist** in the dashboard, shown to every admin (not just brand-new ones) until the site is complete. `components/dashboard/OnboardingChecklist.vue` does this in miniature — this spec extends it rather than replacing it.

---

## Current state (as of #277)

**Current** — the flow is draft-first, and this is the one and only new-site creation path:

`OnboardingWizard.vue`: `welcome → vertical → source → url/manual name → confirm → details → importing → imported`, then optional post-creation handoff cards (brand essentials, social/polish/MCP — all skippable via "Set up later"). Brand essentials is required before leaving onboarding but optional/skippable via "Set up later".

- `submitDetails()` posts to `/api/dashboard/onboarding/drafts/from-place` or `/manual`, which calls `buildOnboardingDraftPayload()` in `server/utils/onboarding-drafts.ts` and returns a `previewToken` for a private preview *before* the site is committed.
- `commitDraft()` turns that draft into a real site via `POST /api/dashboard/onboarding/drafts/[draftId]/commit`, which calls the same `runSiteCreation()` used everywhere else a site gets created (`POST /api/sites`, the MCP `create_site` tool).
- There is no other new-site creation path. `server/api/dashboard/onboarding/setup.post.ts` and `setup-manual.post.ts` used to also contain full site-creation implementations, but the wizard never reached them (new-site creation always went through the draft endpoints above) — #277 removed both files. The still-needed Google Maps preview-only lookup for the wizard's confirm card now lives at its own single-purpose endpoint, `POST /api/dashboard/onboarding/places-preview`.
- Adding a location to an *existing* site is a separate mode of the same `OnboardingWizard.vue` component (`mode="add-location"`), and creates exclusively through `POST /api/dashboard/locations/add` — that endpoint owns both the Places-preview lookup and the mutation for add-location, since (unlike new-site creation) there's no draft/commit split for adding to an already-live site.
- `OnboardingChecklist.vue` tracks 5 items (`business_info`, `hero_image`, `core_offering`, `story`, `post`; `core_offering` was renamed from `menu_or_experiences` in #277 — see completion logic in `server/api/dashboard/onboarding/checklist.get.ts`), rendered on `pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue`.

**Resolved** — kept as dated history, not current findings:

- ~~The checklist's `hero_image` check can never pass because it queries the wrong column.~~ Fixed prior to #277 — `checklist.get.ts` now checks `site_config.hero_image_is_placeholder` and `business_locations.hero_image_asset_id` → `media_assets.source`, matching what both creation paths actually write.
- ~~No dedicated brand step exists anywhere in the wizard.~~ Fixed prior to #277 — `finishCreation()` in `OnboardingWizard.vue` shows a `brandCard` (`components/workspace/onboarding/BrandEssentialsCard.vue`) immediately after a new site is created, prompting for logo/hero photo/brand color before handoff.
- ~~Restaurant-flavored placeholder copy bleeds into non-restaurant verticals.~~ Fixed by #276 — `onboarding-drafts.ts` and `site-template.ts` now have explicit `professional_service` copy (hero/CTA/about/Q&A/post), and neither seeds a menu for it.

**Deferred** — real, tracked gaps, not silently left as current-behavior claims:

- `checklist.get.ts`'s `core_offering` item still only has real completion logic for `restaurant` (menu items) and `experience` (experiences) — a `professional_service` site can never complete it, because there is no offerings/practice-areas content model yet for it to check against. Tracked in #284, which depends on the offerings model from #194/#278.
- `components/workspace/onboarding/OnboardingPreviewPane.vue`'s tab list (`Home`/`Menu`/`About`/`Contact`) is hardcoded and not vertical-aware — a `professional_service` preview shows a `Menu` tab that doesn't exist for that template instead of `/services`. Tracked in #285, deferred to #278's vertical-aware CMS/preview registry.

---

## Why the preview used to read as "blank" (historical — resolved by #276's brand step + explicit vertical copy)

Hero image was never literally empty in either creation path — both `seedNewSite()` and `buildOnboardingDraftPayload()` fall back to a stock photo when no Maps photo is available. The "blank" perception had three real causes, tracked and addressed as follows:

1. **No logo / no brand color.** Resolved — the post-creation `brandCard` step (see above) now collects both immediately after site creation.
2. **Stock hero photo for manual-entry onboarding.** Still current behavior for sites with no Google Maps match — this is an accepted tradeoff (no fabricated photo), not a bug.
3. **Restaurant-flavored placeholder copy leaking into other verticals.** Resolved by #276 (see above).

---

## Content state model — placeholder vs. owner-authored (open question, unchanged)

**Deferred / open design question**, not yet decided or implemented as of #277:

Today there is no way to distinguish "owner wrote this" from "template wrote this" once a row exists in `site_content`/`menu_items`/`media_assets`. A long stock paragraph and a real paragraph the owner wrote both just look like "done" to the checklist and to any future seed/reseed logic.

Recommended mechanism (still just a proposal, not implemented): add a single nullable `placeholder_source` (or reuse a `source` enum: `'template' | 'owner' | null`) column to `site_content`, `menu_items`, and the hero-bearing `media_assets`/`business_locations` rows, set by `seedNewSite()`/`buildOnboardingDraftPayload()` at insert time and cleared automatically the moment the owner edits that row (dashboard CMS save, MCP tool call, or ChowBot edit all already funnel through shared server/domain utilities per the dual-surface rule in `CLAUDE.md`, so this is one clearing point, not three).

- Checklist completion (`core_offering`, `story`, etc.) should check `placeholder_source IS NULL`, not just "a row exists" / "length > 20."
- This is a schema change (per the `server/db/schema.ts` workflow in `CLAUDE.md`) and a real behavior change to checklist semantics — flagged here as a decision point, not something to implement unprompted.
- `menu_items.source != 'template'` / `site_content...source != 'template'` filters already used by `checklist.get.ts` are a partial, ad hoc version of this idea for the fields that already have a `source` column — the proposal above would make it uniform and explicit rather than column-by-column.

---

## Step inventory

### Site-level (once per site)

| # | Step | Required | Lands on |
|---|---|---|---|
| 1 | Business basics (Maps import or manual: name, vertical, address, contact) | Required | Wizard |
| 2 | Draft preview (private, current architecture) | Proposed (not currently step 2) | Wizard → `/preview/draft/...` |
| 3 | Brand essentials — logo, hero photo (upload or keep template), brand color | Optional (skippable) | Wizard, post-creation `brandCard` step |
| 4 | Operations — timezone, currency, notification phone | Required | Wizard |
| 5 | Core offering — menu (restaurant), experiences (experience vertical); no equivalent yet for professional_service (#284) | Required, most prominent step | Wizard, deep-linkable to dashboard CMS later |
| 6 | Story — about, founder story, FAQ seeds | Optional but prompted | Wizard or checklist |
| 7 | Channels — Facebook/Instagram, ChatGPT app install, ChowBot intro | Optional | Wizard handoff cards |
| 8 | Team — invite admins/editors | Optional, explicitly skippable | Wizard or checklist |
| 9 | Launch readiness — domain, final review, publish | Required to go live, not required to keep working in draft | Checklist + `/dashboard/[orgSlug]/~/settings/domains` |

### Location-level (once per location, including the first)

Only asked again on **add-location** (`OnboardingWizard.vue` `mode="add-location"`), never re-collects site-level brand/ops:

- Location title, address, hours, phone
- Notification routing for this location
- Location hero/media (defaults to site hero if not set — do not force a re-upload)
- Optional location-specific notes/social

---

## Open questions (need a decision before implementation)

1. **Does "Create site" move earlier?** Today `commitDraft()` (real site row, real org-scoped data) happens only after the owner clicks "Create site" — the draft preview before that point is a separate, parallel draft record (`onboarding_drafts` table), not the real site. If the draft preview moves to step 2 of 9 above, does the underlying site row get created then (private/unpublished) so all later steps just edit the real site, or does the draft stay a separate pre-commit record through step 9? The first option is simpler (one code path, no draft/commit duplication) but is a bigger behavior change to `site-creation.ts`. The second preserves current semantics but means steps 3-9 keep writing through draft-specific endpoints instead of the normal dashboard CMS path. **Still open — no decision made as of #277.**
2. **Placeholder-source column** — confirm before adding to `schema.ts`/generating a migration, since it changes checklist completion semantics for every existing seeded site. **Still open.**
3. ~~Fix the existing hero_image checklist bug.~~ **Resolved** (see above).

---

## Related work

- #194 — Blawby professional-service template PRD (offerings model, canonical `professional_service` vertical decision).
- #276 — professional_service onboarding (vertical/theme_id resolution, explicit copy, VALID_VERTICALS).
- #277 — this cleanup (endpoint separation, wizard mode contract, vertical documentation, this file's status markers).
- #278 — CMS vertical-aware page/navigation registry (owns the deferred items above: #284, #285).
