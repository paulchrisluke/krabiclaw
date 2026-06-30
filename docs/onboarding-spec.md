# Onboarding Spec — Site-Level vs Location-Level, Sequence, and Content State

## Principle

Global first, local second, persistent after that.

- **Site/org level** (once per site): brand, currency, timezone default, team, ChatGPT app, socials, core offering.
- **Location level** (once per location, repeats on every new location): hours, contact, notification destination, location hero/media, location-specific copy.
- Onboarding is not a single linear wizard that ends at "Create site." The wizard collects the first handful of critical steps; everything else surfaces as a **persistent adaptive checklist** in the dashboard, shown to every admin (not just brand-new ones) until the site is complete. `components/dashboard/OnboardingChecklist.vue` already does this in miniature (5 items, dismissible) — this spec extends it rather than replacing it.

---

## Current state (as built today)

Grounding facts, not opinions:

- `OnboardingWizard.vue` flow: `welcome → vertical → source → url/manual name → confirm → details → importing → imported`, then optional post-creation handoff cards (social/polish/MCP — all skippable via "Set up later").
- A **draft-preview concept already exists**: `submitDetails()` posts to `/api/dashboard/onboarding/drafts/from-place` or `/manual`, which calls `buildOnboardingDraftPayload()` in `server/utils/onboarding-drafts.ts` and returns a `previewToken` for a private preview *before* the site is committed. `commitDraft()` later turns that draft into a real site via `/api/dashboard/onboarding/drafts/[draftId]/commit`. This is the foundation the new "Draft preview" step should build on, not a new mechanism.
- `OnboardingChecklist.vue` tracks 5 items (`business_info`, `hero_image`, `menu_or_experiences`, `story`, `post`), rendered once on `pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue`. Completion logic in `server/api/dashboard/onboarding/checklist.get.ts`.
- **Bug**: the checklist's `hero_image` check queries `site_content` for `field='hero' AND hero_image_asset_id IS NOT NULL` (`checklist.get.ts:75-78`), but neither `seedNewSite()` (`server/utils/site-template.ts`) nor the draft builder write hero through that column — `seedNewSite` writes hero via `business_locations.hero_image_asset_id` + a `media_assets` row, and the draft builder writes `site_content.hero_public_url`. The checklist's hero check can never actually pass for a site created through either current path. Fix this regardless of anything else in this spec.
- **No dedicated brand step exists** anywhere in the wizard. Logo, brand color, and typography are never collected during onboarding. They can only be set later via dashboard CMS settings, which most new owners never find unprompted.

---

## Why the preview reads as "blank"

Hero image is **not literally empty** in either current path — both `seedNewSite()` and `buildOnboardingDraftPayload()` fall back to the same stock photo when no Maps photo is available. The "blank" perception is real but the cause is different from a missing image:

1. **No logo.** Every preview shows a generic hero with no business mark anywhere.
2. **No brand color.** `config.brand_color` is never collected, so every new site renders on whatever the Saya theme default is — visually indistinguishable from every other new site.
3. **Stock hero photo for non-Maps-imported businesses.** Manual-entry onboarding (no Google Maps match) never gets a real photo, only the same shared stock image every other manually-entered site gets.
4. **Restaurant-flavored placeholder copy bleeding into a generic mechanism.** `buildDraftContent()` writes `'Come hungry.'` / `'Come dine with us'` as literal hero/CTA copy for the restaurant vertical (`onboarding-drafts.ts:225-226`). This is vertical-*specific* hardcoded copy injected through the same code path that's supposed to keep `content-registry.ts` defaultValues vertical-*neutral* (per the CLAUDE.md Saya Empty States rule). It is template seed data, not a registry default, so it doesn't technically violate that rule — but it does mean two different "what should an empty field show" mechanisms exist side by side with different content philosophies, which is exactly the inconsistency you're noticing.

The net effect: a brand-new site is technically full of content, but none of it is *theirs*, so it reads as generic/unfinished rather than blank. The fix is to collect brand identity earlier (logo + color, see sequence below) and to make placeholder content visibly and structurally distinguishable from real content so the owner is steered toward replacing it.

---

## Content state model — fix for the null/empty/placeholder inconsistency

Today there is no way to distinguish "owner wrote this" from "template wrote this" once a row exists in `site_content`/`menu_items`/`media_assets`. A long stock paragraph and a real paragraph the owner wrote both just look like "done" to the checklist and to any future seed/reseed logic. That's the root of the inconsistency you're seeing — not that the rendering layer is inconsistent (it isn't; `useBootstrap.ts` already always returns `''` not `null`, and `content-registry.ts` defaultValues are already correctly vertical-neutral), but that **template-seeded placeholder rows and owner-authored rows are indistinguishable in storage.**

Three states should be explicit, not inferred:

| State | Where it comes from | How it should be marked |
|---|---|---|
| **Unset** | No DB row exists | Render via `content-registry.ts` `defaultValue` (already correct — generic, vertical-neutral, no business identity) |
| **Template placeholder** | `seedNewSite()` / `buildOnboardingDraftPayload()` insert a row at creation time so the preview isn't empty | New: mark these rows so the system knows they're not yet reviewed by the owner |
| **Owner-authored** | Owner edited via dashboard CMS, MCP, or ChowBot | No mark — this is "real," counts toward checklist completion |

Recommended mechanism: add a single nullable `placeholder_source` (or reuse a `source` enum: `'template' | 'owner' | null`) column to `site_content`, `menu_items`, and the hero-bearing `media_assets`/`business_locations` rows, set by `seedNewSite()`/`buildOnboardingDraftPayload()` at insert time and **cleared automatically the moment the owner edits that row** (dashboard CMS save, MCP tool call, or ChowBot edit all already funnel through shared server/domain utilities per the dual-surface rule in CLAUDE.md, so this is one clearing point, not three). Concretely:

- Checklist completion (`menu_or_experiences`, `story`, etc.) should check `placeholder_source IS NULL`, not just "a row exists" / "length > 20." A site with 8 template menu items and zero owner edits should show "menu" as **not done**, not done.
- The dashboard can reuse the existing `SayaMcpHint.vue` affordance pattern (already built for empty states) on placeholder rows too — "This is example content — click to customize" — rather than only using it where a section is fully empty.
- This is a schema change (per the `server/db/schema.ts` workflow in CLAUDE.md) and a real behavior change to checklist semantics, not a frontend-only fix — flagging it here as a decision point rather than implementing it unprompted.

This directly fixes "sometimes null, sometimes empty state, sometimes placeholder": going forward there are exactly three states, each with one clear owner (registry default / template insert / real edit), and the checklist can finally tell them apart.

---

## Step inventory

### Site-level (once per site)

| # | Step | Required | Lands on |
|---|---|---|---|
| 1 | Business basics (Maps import or manual: name, vertical, address, contact) | Required | Wizard |
| 2 | Draft preview (private, reuses existing draft mechanism) | Required (shown automatically, not opt-in) | Wizard → `/preview/draft/...` |
| 3 | Brand essentials — logo, hero photo (upload or keep template), brand color | Required | Wizard (new step) |
| 4 | Operations — timezone, currency, notification phone | Required | Wizard |
| 5 | Core offering — menu (restaurant) or experiences (experience vertical) | Required, most prominent step | Wizard, deep-linkable to dashboard CMS later |
| 6 | Story — about, founder story, FAQ seeds | Optional but prompted | Wizard or checklist |
| 7 | Channels — Facebook/Instagram, ChatGPT app install, ChowBot intro | Optional | Wizard handoff cards (already exist) or checklist |
| 8 | Team — invite admins/editors | Optional, explicitly skippable | Wizard or checklist |
| 9 | Launch readiness — domain, final review, publish | Required to go live, not required to keep working in draft | Checklist + `/dashboard/[orgSlug]/~/settings/domains` |

### Location-level (once per location, including the first)

Only asked again on **add-location**, never re-collects site-level brand/ops:

- Location title, address, hours, phone
- Notification routing for this location
- Location hero/media (defaults to site hero if not set — do not force a re-upload)
- Optional location-specific notes/social

---

## Recommended first-session sequence

The minimum path to "I can actually use this," in order:

1. Import business (Maps or manual)
2. Draft preview (immediately — reuse existing draft mechanism, see open question below)
3. Brand essentials (logo, hero, color) — **new step, this is what currently doesn't exist**
4. Timezone/currency
5. Menu or experiences
6. About/story
7. Invite teammate
8. Install ChatGPT app
9. Optional socials/notifications polish

Everything past step 5 can be deferred to the persistent checklist without harming activation — but step 3 (brand) should move from "never asked" to "asked right after the first preview," since that's specifically what's causing the generic/blank perception today.

---

## Open questions (need a decision before implementation)

1. **Does "Create site" move earlier?** Today `commitDraft()` (real site row, real org-scoped data) happens only after the owner clicks "Create site" at the end of the details step — the draft preview before that point is a separate, parallel draft record (`onboarding_drafts` style table), not the real site. If "Draft preview" becomes step 2 of 9, does the underlying site row get created then (private/unpublished) so all later steps just edit the real site, or does the draft stay a separate pre-commit record through step 9? The first option is simpler (one code path, no draft/commit duplication) but is a bigger behavior change to `site-creation.ts`. The second preserves current semantics but means steps 3-9 have to keep writing through draft-specific endpoints instead of the normal dashboard CMS path.
2. **Placeholder-source column** — confirm before adding to `schema.ts`/generating a migration, since it changes checklist completion semantics for every existing seeded site (template rows seeded before this column existed would all read as `NULL` placeholder_source = "owner-authored," i.e. falsely "done," unless backfilled).
3. **Fix the existing hero_image checklist bug** independently of the rest of this spec — it's a pre-existing correctness bug, not a new design.
