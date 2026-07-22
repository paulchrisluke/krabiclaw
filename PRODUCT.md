# KrabiClaw — Product Context

## What It Is

**Website builder for local and professional-service businesses** — multi-tenant SaaS where owners get a subdomain site and build their web presence completely through conversation with ChatGPT (via MCP) or the dashboard CMS. SSR-rendered, SEO-optimised sites. The ChatGPT plugin is the primary creation surface. Supports the `restaurant`, `experience`, and `professional_service` verticals today, with the model designed to easily accommodate more local-business categories over time. See `CONTEXT.md` for the canonical vertical contract (app-level `professional_service` vs. its `service` DB-storage alias).

---

## MCP Surfaces

KrabiClaw now ships two separate MCP apps.

### Client MCP

Customer-facing ChatGPT app for tenant site management.

- OAuth2 authorization at `/api/auth/oauth2/` — ChatGPT handles auth before any tool call
- MCP endpoint at `/api/mcp` (`server/api/mcp.post.ts`)
- Scope: `tenant`
- 90+ MCP tools covering: site setup, locations, menus, experiences, posts, media, translation, Google Business, Facebook, analytics, work requests
- Widget system is legacy/deprecated for client photo uploads; Client MCP should ask users to attach photos directly in ChatGPT and then use `upload_user_photo`. `list_sites`, `import_from_maps`, `show_site_preview`, `show_generated_images`, and onboarding return plain text.
- Image generation via ChatGPT's native `image_generation` Responses API tool (`gpt-image-1` / `gpt-image-2`) — not DALL-E
- Plugin landing page at `/plugin`

### Platform Admin MCP

Internal ChatGPT app for KrabiClaw operators only.

- MCP endpoint at `/api/mcp/platform` (`server/api/mcp/platform.post.ts`)
- Scope: `platform_admin`
- Auth requires global Better Auth `user.role = 'admin'`
- Tools limited to platform blog/docs operations for `krabiclaw.com/blog` and `krabiclaw.com/docs`, plus read-only categorized release data from merged GitHub pull requests

The dashboard is still the home for billing, org settings, unified inbox (contact, reservations, bookings, reviews), and analytics. MCP and dashboard operate on the same D1 backend with no forked business logic.

See `docs/mcp-surface-split.md` for the canonical split rules.

---

## Verticals

KrabiClaw supports multiple business verticals. ChatGPT asks the user directly during onboarding (plain text) and passes the chosen vertical to `create_site`; the dashboard onboarding wizard and multi-site "Add a site" picker offer the same three choices.

| Vertical (app-level) | Description | DB-stored as |
|----------|-------------|-------------|
| `restaurant` | Food & beverage — menus, reviews, hours, reservations | `restaurant` |
| `experience` | Activity-based businesses — experiences, bookings, classes | `experience` |
| `professional_service` | Legal and other professional/advisory services — offerings (practice areas), consultations, pricing/donate pages | `service` |

`professional_service` is the one canonical app-level value; `service` is its DB-storage alias, not a second vertical — see `CONTEXT.md`'s "Tenant vertical (canonical contract)" entry for the full normalization-boundary explanation (`toStoredVertical()` / `normalizeVertical()`).

Experiences have their own data model: `experiences` table, `experience_bookings`, experience-specific MCP tools (`list_experiences`, `create_experience`, `list_experience_bookings`, etc.) and Saya theme routes at `/experiences/[slug]`.

Professional-service tenants render through the Blawby template (see "Public Templates" below) rather than Saya, and don't yet have a first-class offerings/practice-areas content model in the dashboard CMS — that's tracked separately (issue #278).

---

## Business Model

Pricing managed entirely in Stripe — never duplicated in code. All pricing UI reads from `GET /api/billing/plans`.

| Tier | Price | Key Features |
|------|-------|-------------|
| Free (Starter) | $0 | Subdomain, Saya theme, manual editor, basic AI credits, 1 locale, Post-booking review requests |
| Growth | $49/mo | Custom domain + SSL, Google Business sync, 2,000 AI credits/mo, translation (1 language), Priority Support |

Locations are unlimited on all plans. Credit top-ups are available as one-time purchases.

**Upgrade modal** triggers on: connecting Google Business, custom domain setup, translation, removing KrabiClaw branding.

**Managed / Concierge Services Deprecated.** The "Managed by Paul & Julia" service (including Managed and SEO Accelerator tiers) is no longer offered. The `MANAGED_SERVICE_ENABLED` feature flag remains off to hide these from the dashboard and marketing sites.

### WhatsApp / Google Places cost recovery

WhatsApp Business API sends and Google Places API calls cost real per-use money with no dedicated billing surface — rather than build new metered Stripe billing pre-launch, they draw from the existing `ai_credits` balance (`server/utils/ai-credits.ts`) via `chargeFlatCredits()`, alongside the token-based charging already enforced on `/api/ai/*`.

- Charged: WhatsApp notifications (`sendWhatsAppNotification`), ChowBot free-text WhatsApp replies, and on-demand Google Places search/details calls (dashboard autocomplete, onboarding maps import, manual re-sync, the MCP `import_from_maps` tool).
- Never charged: WhatsApp OTP (`sendWhatsAppOtp`) — auth-critical, must always send — and the background `google-business-sync` cron task, which is infrastructure upkeep a customer didn't explicitly trigger.
- Exhaustion is a **soft-fail** for both: the action still goes through at zero balance (losing a reservation confirmation is worse than the unpaid cost), unlike the hard 402 block on `/api/ai/*`.
- Flat per-action credit costs (`ACTION_CREDIT_COSTS` in `ai-credits.ts`) are launch-time estimates pegged against the cheapest $9/500-credit top-up rate vs. list Meta/Google pricing — revisit once real invoiced volume exists.

---

## Current Clients

| Client | Vertical | Template | Locations |
|--------|----------|----------|-----------|
| **Kikuzuki** | Restaurant | Saya | 2 locations — Ao Nang + Krabi Town |
| **Pottery House Krabi** | Experience | Saya | 2 locations — main + beachfront |
| **NCLS** (North Carolina Legal Services) | Professional service | Blawby | Statewide/remote service area — cutover-ready per #194; production DNS cutover is a separate, deliberate follow-up step |

---

## Public Templates

Template selection is registry-driven (`utils/template-registry.ts`'s `publicTemplateRegistry`, resolved via `resolvePublicTemplate()`), not a hardcoded per-vertical `if` chain — a tenant's `theme_id` + `vertical` map to exactly one template definition, and a future third template only needs a new registry entry.

### Saya (restaurant, experience)

Default template for restaurant/experience tenants. SSR-rendered, SEO-first, editorial typography. Location-centric with vertical-aware routing.

#### URL Structure

```
/                              → Home: hero + location/experience entry points + brand feed
/locations                     → All locations grid
/locations/[slug]              → Location home: hours, address, map, menu preview
/locations/[slug]/menu         → Full menu
/locations/[slug]/reviews      → Reviews: aggregate score + star distribution + owner replies
/locations/[slug]/photos       → Photo gallery by category
/locations/[slug]/qa           → Q&A: owner-answered pairs
/locations/[slug]/contact      → Map embed, hours, address, directions CTA
/experiences                   → All experiences grid
/experiences/[slug]            → Experience detail: description, pricing, bookings CTA
/about                         → Brand story
/contact                       → Brand contact form
/reservations                  → Reservation form
/posts                         → Posts / news feed
/menu                          → Redirects to primary location menu (SEO fallback)
```

Nav: Logo | Locations (dropdown) | Story | Contact | **RESERVE** (primary CTA). Locations dropdown built at runtime from `business_locations`.

### Blawby (professional_service)

Template for professional-service tenants, proven first against NCLS (#194). Offerings default to site-level (not location-scoped), since many professional-service tenants serve a statewide/remote area rather than a single storefront.

#### URL Structure

```text
/                              → Home
/about                         → Brand story, compliance/organization info
/services                      → Offerings index (practice areas)
/services/[slug]               → Offering detail
/pricing                       → Pricing/eligibility, optional structured calculator component
/donate                        → External donation CTA (no native payment processing)
/schedule                      → Consultation entry point (external URL, e.g. Clio Grow, for now)
/contact                       → Brand contact form
/blog                          → Article index
/article/[slug]                → Article detail (canonical — preserved for SEO parity with the NCLS source site)
/policies/privacy, /policies/terms, /third-party-notices → Tenant-owned legal pages
```

Both Saya and Blawby support a blog: Saya's is the shared `posts` primitive rendered at `/posts`; Blawby's is `/blog` + `/article/[slug]`. Structured data for Blawby tenants is generated from platform models (`utils/professional-service-schema.ts`), never pasted as raw tenant JSON-LD.

---

## Integrations

| Integration | Status |
|-------------|--------|
| Google OAuth (login) | ✅ Live |
| WhatsApp OTP login | ✅ Built — blocked on real number registration |
| Stripe billing | ✅ Live |
| Cloudflare AI Gateway | ✅ Live |
| WhatsApp Business API | ✅ Built — blocked on real number |
| Facebook / Instagram Graph API | ✅ OAuth + Pages sync + publish built |
| Google Places API sync | ✅ Live — hours, address, rating, reviews (up to 5) |
| Google Business Profile API | ⏳ API approval pending — RPM quota locked at 0 |
| Google Places API | ✅ Live — location autocomplete + `import_from_maps` MCP tool |
| Cloudflare Stream | ✅ Built — video upload/playback |
| ChatGPT Client MCP | ✅ Live — primary customer creation surface |
| ChatGPT Platform Admin MCP | ✅ Live — internal platform operations only |
| ChatGPT image generation | ✅ Live — `gpt-image-1`/`gpt-image-2` via Responses API |

---

## Architecture

- All backend-originated AI calls route through Cloudflare AI Gateway — never call model APIs directly from server code (exception: ChatGPT native `image_generation` is initiated by the OpenAI runtime, not by KrabiClaw server code, and bypasses the gateway by design)
- MCP server is the canonical creation surface; dashboard CMS and ChowBot are secondary
- Posts are the content primitive — channels are adapters on top of `post_channel_jobs`
- All location data is CRUD-available in D1 regardless of GMB connection — GMB sync is additive
- Notification delivery is channel-agnostic — `notifications.channel` column means email/push can be added with no schema change
- WhatsApp and Instagram both go through the same Facebook app — single OAuth covers both
- ChowBot is the owner of AI conversations; dashboard and WhatsApp are interfaces over the same D1-backed backend
- Credit system enforced at the `/api/ai/*` route layer — 402 on exhaustion
- Image generation: ChatGPT generates natively → `save_generated_image_file` persists via Cloudflare Images → `show_generated_images` renders the widget. Never pass raw base64 to MCP tools.

---

## Dashboard Model

- **Organization** is the site/brand workspace and billing/team boundary — vertical-neutral: an org can hold a restaurant, an experience business, or a professional-service firm, and (per "One org can have multiple sites" below) can even hold a mix.
- **One org can have multiple sites** — there is no unique-per-org constraint on sites. Sites are explicit everywhere — there is no "first site in org" fallback in dashboard routing or billing.
- Each site has its own plan and Stripe subscription (`site_billing`). The Stripe *customer* stays at org level (`organization_billing.stripe_customer_id`) — one payment method covers every site in the org.
- A new site always starts on `free`, even under a paid org. If the org already has another site on a paid plan and a saved card on file, the dashboard offers to auto-subscribe the new site immediately (`POST /api/billing/site-subscribe`, no Checkout redirect). Otherwise it's a normal Checkout upgrade later.
- **Sites** are the primary day-to-day dashboard context and selector. A location becomes the working context only inside that site's location workspace. For Saya (restaurant/experience) sites this is a physical location; Blawby's offerings are site-level by default and don't require a location to have a public street address (a professional-service tenant may serve a statewide/remote area).
- Public tenant routes are template-specific: Saya remains location/experience-centric under `/locations/[slug]` and `/experiences/[slug]`; Blawby is offering-centric under `/services/[slug]` (see "Public Templates" above).
- Dashboard routes follow the Vercel-style workspace shape, with an explicit site segment:
  - `/dashboard/{orgSlug}` — org root; lists sites, auto-redirects to the single site if the org has exactly one
  - `/dashboard/{orgSlug}/sites/{siteSlug}` — site workspace (`siteSlug` is the site's `subdomain`)
  - `/dashboard/{orgSlug}/sites/{siteSlug}/locations/{locationSlug}` — location workspace
  - `/dashboard/{orgSlug}/sites/new` — create another site under this org
  - `/dashboard/{orgSlug}/settings/billing` — org billing (lists every site's plan/subscription, not just one)
  - `/dashboard/account/settings` — personal account settings
- App-facing dashboard APIs use `/api/dashboard/*`; the active site is resolved server-side from the `x-dashboard-site-slug` header (auto-attached by `plugins/dashboard-site-header.ts` based on the route's `siteSlug`), not by guessing the org's oldest site.
- **Site transfers move only the site** — its locations, content, billing, and entitlements reparent into the recipient's own existing org. The org itself, its other sites, and org-level billing/credits never move.
- Dashboard is home for: billing, org settings, unified inbox (contact inquiries, reservations, bookings, reviews), analytics.
