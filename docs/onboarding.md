# Onboarding

## Principle

Global first, local second, persistent after that.

- **Site/org level** (once per site): brand, currency, timezone default, team, ChatGPT app, socials, core offering.
- **Location level** (once per location, repeats on every new location): hours, contact, notification destination, location hero/media, location-specific copy.
- Onboarding is not a single linear flow that ends at "Create site." It collects the first handful of critical steps; everything else is done from the dashboard after the site exists. The flow itself loads no checklist; `server/utils/onboarding-checklist.ts` feeds the organization analytics report only.

## Current flow

The flow is draft-first, and this is the one and only new-site creation path:

One screen per question, one question per URL, under `/dashboard/onboarding`: `type → name → source → [maps → confirm] → location → contact → hours → [products] → look → review`. `ONBOARDING_STEPS` in `composables/useOnboardingFlow.ts` is the only place that order is written down — Back, Next, the skipped steps and where a resumed draft lands all read it. `composables/useOnboardingDraft.ts` owns every server call; the step screens own presentation and nothing else.

- The first real business identity creates an active draft through `POST /api/dashboard/onboarding/drafts/active`: manual name entry creates a manual draft, and confirming a Google listing creates a Google Places draft. That same first save also creates the **real site**, pending, in a new organization named after the brand: `ensureOnboardingSite()` calls the same `runSiteCreation()` used by the only other site-creation entry point, `POST /api/sites`, with `activate: false`. Both pass the target organization explicitly — `/dashboard/onboarding` is the "New Organization" entry point, so a draft never carries one and the first save creates it and records it on the draft; `POST /api/sites` takes the organization from the dashboard route's `org` query or an explicit `organizationId`.
- Every following save re-applies the whole draft to that site through `applyOnboardingDraftToSite()`, which is a full rebuild and idempotent. The preview pane frames the site itself, on its own subdomain, carrying the site's preview token — there is no separate draft renderer. The site's address is claimed at the first save and does not change if the brand name does.
- `activate()` makes it public via `POST /api/dashboard/onboarding/drafts/[draftId]/activate`: it re-applies the draft, flips `onboarding_status` to `active`, makes the organization the session's active one, and closes the draft. An abandoned pending site is removed by the `deletion-sweep` task (see [Deleting a tenant](#deleting-a-tenant)).
- Adding a location to an *existing* site walks the same step table, as the `add-location` flow: a strict subset — `name → source → [maps → confirm] → location → contact → hours → review`, with no business type, no brand and no activation, because the site already has all three. It is not routed; `pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/new.vue` is the whole walk and holds the current step itself. It writes nothing until the last step, and creates exclusively through `POST /api/dashboard/locations` — that endpoint owns both the Places-preview lookup and the mutation for add-location.

## Content state model

Generated placeholder rows are no longer part of onboarding or site creation. Tenant pages, menu items, and media are either owner/imported records or absent. Missing content is omitted or returned as an explicit empty/error state.

## Step inventory

### Site-level (once per site)

| # | Step | Required | Lands on |
|---|---|---|---|
| 1 | Business basics (Maps import or manual: name, vertical, address, contact) | Required | `/dashboard/onboarding` |
| 2 | Site preview (the pending site on its own subdomain, preview token) | Alongside every step, in the preview pane | `https://<subdomain>/` |
| 3 | Brand and homepage hero — colour, logo, photo, headline, description | Optional (skippable) | `/dashboard/onboarding/look` |
| 4 | Operations — timezone, notification phone | Required | `/dashboard/onboarding/hours` |
| 5 | Core offering — menu (restaurant), experiences (experience vertical); professional-service offerings | Optional here, deep-linkable to the dashboard CMS later | `/dashboard/onboarding/products` |
| 7 | Story — about, founder story, FAQ seeds | Optional | Dashboard CMS |
| 8 | Channels — Facebook/Instagram, ChatGPT app install, ChowBot intro | Optional | Dashboard (not part of the onboarding flow) |
| 9 | Team — invite admins/editors | Optional, explicitly skippable | Dashboard settings |
| 10 | Launch readiness — domain, final review, publish | Required to go live, not required to keep working in draft | `/dashboard/[orgSlug]/sites/[siteSlug]/domains` |

### Location-level (once per location, including the first)

Only asked again on **add-location** (the `add-location` flow), which never re-collects site-level brand/ops:

- Location title, address, hours, phone
- Notification routing for this location
- Location hero/media (uses location media only; it remains empty until supplied)
- Optional location-specific notes/social

## Deleting a tenant

Onboarding creates the site before the owner has finished answering, so leaving
the flow leaves a pending site holding a subdomain. `server/utils/tenant-deletion.ts`
is the only path that removes one, and the `deletion-sweep` task (daily, 03:00)
runs it: it releases the Cloudflare custom hostnames and the Cloudflare Images
the organization is the last holder of, then Better Auth deletes the
organization and D1's `ON DELETE CASCADE` takes the sites, domains, locations,
content and media with it. Owners reach the same path from Site settings →
Delete workspace and Account → Delete account; both schedule the deletion 30
days out and can be cancelled until then, and the site keeps serving in the
meantime.
