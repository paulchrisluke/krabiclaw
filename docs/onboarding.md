# Onboarding

## Principle

Global first, local second, persistent after that.

- **Site/org level** (once per site): brand, currency, timezone default, team, ChatGPT app, socials, core offering.
- **Location level** (once per location, repeats on every new location): hours, contact, notification destination, location hero/media, location-specific copy.
- Onboarding is not a single linear wizard that ends at "Create site." The wizard collects the first handful of critical steps; everything else surfaces as a **persistent adaptive checklist** in the onboarding surface until the site is complete.

## Current flow

The flow is draft-first, and this is the one and only new-site creation path:

`OnboardingWizard.vue`: `welcome → vertical → source → url/manual name → confirm → location → contact → currency → hours → brand → hero → draft_ready → create → imported`, then optional post-creation handoff cards (manager alerts, brand essentials, social/polish/MCP — all skippable where the cards allow).

- The first real business identity creates an active draft through `POST /api/dashboard/onboarding/drafts/active`: manual name entry creates a manual draft, and confirming a Google listing creates a Google Places draft. Completed onboarding sections patch that same active draft, and the preview renders from `/preview/draft/:draftId` until commit.
- `commitDraft()` turns that draft into a real site via `POST /api/dashboard/onboarding/drafts/[draftId]/commit`, which calls the same `runSiteCreation()` used everywhere else a site gets created (`POST /api/sites`, the MCP `create_site` tool).
- Adding a location to an *existing* site is a separate mode of the same `OnboardingWizard.vue` component (`mode="add-location"`), and creates exclusively through `POST /api/dashboard/locations/add` — that endpoint owns both the Places-preview lookup and the mutation for add-location.
- The onboarding context tracks 5 items (`business_info`, `hero_image`, `core_offering`, `story`, `post`). The dashboard home does not load this resource.

## Content state model

Generated placeholder rows are no longer part of onboarding or site creation. Tenant pages, menu items, and media are either owner/imported records or absent. Missing content is omitted or returned as an explicit empty/error state.

## Step inventory

### Site-level (once per site)

| # | Step | Required | Lands on |
|---|---|---|---|
| 1 | Business basics (Maps import or manual: name, vertical, address, contact) | Required | Wizard |
| 2 | Draft preview (private, current architecture) | Proposed (not currently step 2) | Wizard → `/preview/draft/...` |
| 3 | Brand — brand color and logo | Optional (skippable) | Wizard active draft |
| 4 | Homepage hero — hero photo, headline, and description | Optional (skippable) | Wizard active draft |
| 5 | Operations — timezone, currency, notification phone | Required | Wizard |
| 6 | Core offering — menu (restaurant), experiences (experience vertical); professional-service offerings | Required, most prominent step | Wizard, deep-linkable to dashboard CMS later |
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

## Canonical checklist

The canonical checklist is loaded by `server/utils/onboarding-checklist.ts` through the onboarding context. The dashboard home does not prefetch it.