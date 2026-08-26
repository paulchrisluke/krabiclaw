# Onboarding Spec — Site-Level vs Location-Level, Sequence, and Content State

> **Status key used throughout this document:**
> - **Current** — true today, mechanically checkable against the code cited.
> - **Resolved** — was a real gap when originally written and is now fixed.
>
> This document previously mixed current-state description, resolved bug writeups, and open product questions with no way to tell which was which — see #277 (onboarding architecture cleanup), which added these markers and reconciled every claim below against the code as of that issue.

## Principle

Global first, local second, persistent after that.

- **Site/org level** (once per site): brand, currency, timezone default, team, ChatGPT app, socials, core offering.
- **Location level** (once per location, repeats on every new location): hours, contact, notification destination, location hero/media, location-specific copy.
- Onboarding is not a single linear wizard that ends at "Create site." The wizard collects the first handful of critical steps; everything else surfaces as a **persistent adaptive checklist** in the onboarding surface until the site is complete. The canonical checklist is loaded by `server/utils/onboarding-checklist.ts` through the onboarding context; the dashboard home does not prefetch it.

---

## Current state (as of #277)

**Current** — the flow is draft-first, and this is the one and only new-site creation path:

`OnboardingWizard.vue`: `welcome → vertical → source → url/manual name → confirm → location → contact → currency → hours → brand → hero → draft_ready → create → imported`, then optional post-creation handoff cards (manager alerts, brand essentials, social/polish/MCP — all skippable where the cards allow).

- The first real business identity creates an active draft through `POST /api/dashboard/onboarding/drafts/active`: manual name entry creates a manual draft, and confirming a Google listing creates a Google Places draft. Completed onboarding sections patch that same active draft, and the preview renders from `/preview/draft/:draftId` until commit.
- `commitDraft()` turns that draft into a real site via `POST /api/dashboard/onboarding/drafts/[draftId]/commit`, which calls the same `runSiteCreation()` used everywhere else a site gets created (`POST /api/sites`, the MCP `create_site` tool).
- There is no other new-site creation path. `server/api/dashboard/onboarding/setup.post.ts` and `setup-manual.post.ts` used to also contain full site-creation implementations, but the wizard never reached them; #277 removed both files, and new-site onboarding now goes through the active draft endpoint above. The still-needed Google Maps preview-only lookup for the wizard's confirm card now lives at its own single-purpose endpoint, `POST /api/dashboard/onboarding/places-preview`.
- Adding a location to an *existing* site is a separate mode of the same `OnboardingWizard.vue` component (`mode="add-location"`), and creates exclusively through `POST /api/dashboard/locations/add` — that endpoint owns both the Places-preview lookup and the mutation for add-location, since (unlike new-site creation) there's no draft/commit split for adding to an already-live site.
- The onboarding context tracks 5 items (`business_info`, `hero_image`, `core_offering`, `story`, `post`; `core_offering` was renamed from `menu_or_experiences` in #277 — see completion logic in `server/utils/onboarding-checklist.ts` and `server/api/dashboard/onboarding/checklist.get.ts`). The dashboard home does not load this resource.

**Resolved** — kept as dated history, not current findings:

- ~~The checklist's `hero_image` check can never pass because it queries the wrong source.~~ Fixed prior to #277; the checklist now resolves the location `hero` media placement and its canonical asset source.
- ~~No dedicated brand step exists anywhere in the wizard.~~ Fixed prior to #277 and revised in #459 — `OnboardingWizard.vue` now prompts before commit with separate skippable `Brand` and `Homepage hero` draft steps, instead of combining brand color, logo, hero photo, and homepage copy in one dense card.
- ~~Restaurant-flavored placeholder copy bleeds into non-restaurant verticals.~~ Resolved — onboarding and site creation persist only owner/imported content; professional-service sites use the Blawby renderer and never receive generated menu, Q&A, story, or CTA copy.

**Resolved in the cleanup pass:**

- `onboarding-checklist.ts` uses menu, experiences, or professional-service offerings for the `core_offering` check.
- `OnboardingPreviewPane.vue` resolves its secondary tab from the canonical vertical/template registry, so professional-service previews expose Services rather than Menu.

---

## Why the preview used to read as "blank" (historical — resolved by active draft preview)

The onboarding preview now renders the active draft through the same Saya bootstrap path as tenant pages. When owner or Google media is missing, the source of truth stays media-free and the Saya section renders its non-photo treatment; it does not invent a stock/photo placeholder. The old "blank" perception had three real causes, tracked and addressed as follows:

1. **No logo / no brand color.** Resolved — the pre-commit `Brand` step (see above) now collects both on the active draft.
2. **No real hero photo for manual-entry onboarding.** Current behavior: no photo is shown until the owner provides one or a Google/imported media source supplies it.
3. **Restaurant-flavored placeholder copy leaking into other verticals.** Resolved by #276 (see above).

---

## Content state model

Generated placeholder rows are no longer part of onboarding or site creation.

Tenant pages, menu items, and media are either owner/imported records or absent. Missing content is omitted or returned as an explicit empty/error state, so no placeholder-source column is needed.

---

## Step inventory

### Site-level (once per site)

| # | Step | Required | Lands on |
|---|---|---|---|
| 1 | Business basics (Maps import or manual: name, vertical, address, contact) | Required | Wizard |
| 2 | Draft preview (private, current architecture) | Proposed (not currently step 2) | Wizard → `/preview/draft/...` |
| 3 | Brand — brand color and logo | Optional (skippable) | Wizard active draft |
| 4 | Homepage hero — hero photo, headline, and description | Optional (skippable) | Wizard active draft |
| 5 | Operations — timezone, currency, notification phone | Required | Wizard |
| 6 | Core offering — menu (restaurant), experiences (experience vertical); no equivalent yet for professional_service (#284) | Required, most prominent step | Wizard, deep-linkable to dashboard CMS later |
| 7 | Story — about, founder story, FAQ seeds | Optional but prompted | Wizard or checklist |
| 8 | Channels — Facebook/Instagram, ChatGPT app install, ChowBot intro | Optional | Wizard handoff cards |
| 9 | Team — invite admins/editors | Optional, explicitly skippable | Wizard or checklist |
| 10 | Launch readiness — domain, final review, publish | Required to go live, not required to keep working in draft | Checklist + `/dashboard/[orgSlug]/sites/[siteSlug]/domains` |

### Location-level (once per location, including the first)

Only asked again on **add-location** (`OnboardingWizard.vue` `mode="add-location"`), never re-collects site-level brand/ops:

- Location title, address, hours, phone
- Notification routing for this location
- Location hero/media (uses location media only; it remains empty until supplied)
- Optional location-specific notes/social

---

## Open questions (product decisions, not runtime fallbacks)

1. **Does "Create site" move earlier?** Today `commitDraft()` (real site row, real org-scoped data) happens only after the owner clicks "Create site" — the draft preview before that point is a separate, parallel draft record (`onboarding_drafts` table), not the real site. If the draft preview moves to step 2 of 9 above, does the underlying site row get created then (private/unpublished) so all later steps just edit the real site, or does the draft stay a separate pre-commit record through step 9? The first option is simpler (one code path, no draft/commit duplication) but is a bigger behavior change to `site-creation.ts`. The second preserves current semantics but means steps 3-9 keep writing through draft-specific endpoints instead of the normal dashboard CMS path. **Still open — no decision made as of #277.**
2. **Placeholder-source column** — not required: generated placeholder rows were removed, so missing content is represented by absence and no schema column is added.
3. ~~Fix the existing hero_image checklist bug.~~ **Resolved** (see above).

---

## Related work

- #194 — Blawby professional-service template PRD (offerings model, canonical `professional_service` vertical decision).
- #276 — professional_service onboarding (vertical/theme_id resolution, explicit copy, VALID_VERTICALS).
- #277 — this cleanup (endpoint separation, wizard mode contract, vertical documentation, this file's status markers).
- #278 — CMS vertical-aware page/navigation registry.
