# KrabiClaw — Product Context

## What It Is

**Website builder for local businesses** — multi-tenant SaaS where owners get a subdomain site and build their web presence completely through conversation with ChatGPT (via MCP) or the dashboard CMS. SSR-rendered, SEO-optimised sites. The ChatGPT plugin is the primary creation surface. Supports the `restaurant`, `experience`, and other local-business verticals, with the model designed to easily accommodate any local business over time.

---

## MCP Surfaces

KrabiClaw now ships two separate MCP apps.

### Client MCP

Customer-facing ChatGPT app for tenant site management.

- OAuth2 authorization at `/api/auth/oauth2/` — ChatGPT handles auth before any tool call
- MCP endpoint at `/api/mcp` (`server/api/mcp.post.ts`)
- Scope: `tenant`
- 90+ MCP tools covering: site setup, locations, menus, experiences, posts, media, translation, Google Business, Facebook, analytics, work requests
- Widget system (HTML responses rendered inline in ChatGPT) — currently scoped to `request_photo_upload` only; `list_sites`, `import_from_maps`, `show_site_preview`, `show_generated_images`, and onboarding all return plain text (a custom widget was overkill for basic list/selection output)
- Image generation via ChatGPT's native `image_generation` Responses API tool (`gpt-image-1` / `gpt-image-2`) — not DALL-E
- Plugin landing page at `/plugin`

### Platform Admin MCP

Internal ChatGPT app for KrabiClaw operators only.

- MCP endpoint at `/api/mcp/platform` (`server/api/mcp/platform.post.ts`)
- Scope: `platform_admin`
- Auth requires global Better Auth `user.role = 'admin'`
- Tools limited to platform blog/docs operations for `krabiclaw.com/blog` and `krabiclaw.com/docs`

The dashboard is still the home for billing, org settings, inbox triage, analytics, and the managed service work queue. MCP and dashboard operate on the same D1 backend with no forked business logic.

See `docs/mcp-surface-split.md` for the canonical split rules.

---

## Verticals

KrabiClaw supports multiple business verticals. ChatGPT asks the user directly during onboarding (plain text) and passes the chosen vertical to `create_site`.

| Vertical | Description |
|----------|-------------|
| `restaurant` | Food & beverage — menus, reviews, hours, reservations |
| `experience` | Activity-based businesses — experiences, bookings, classes |

Experiences have their own data model: `experiences` table, `experience_bookings`, experience-specific MCP tools (`list_experiences`, `create_experience`, `list_experience_bookings`, etc.) and Saya theme routes at `/experiences/[slug]`.

---

## Business Model

Pricing managed entirely in Stripe — never duplicated in code. All pricing UI reads from `GET /api/billing/plans`.

| Tier | Price | Key Features |
|------|-------|-------------|
| Free (Starter) | $0 | Subdomain, Saya theme, manual editor, basic AI credits, 1 locale |
| Growth | $49/mo | Custom domain + SSL, Google Business sync, 2,000 AI credits/mo, translation (1 language) |
| Managed | $149/mo | Everything in Growth + unlimited translation languages, unlimited AI credits, managed service, advanced SEO |
| SEO Accelerator | $349/mo | Everything in Managed + SEO accelerator entitlement |

Locations are unlimited on all plans. Credit top-ups are available as one-time purchases.

**Upgrade modal** triggers on: connecting Google Business, custom domain setup, translation, removing KrabiClaw branding.

---

## Current Clients

| Client | Vertical | Locations |
|--------|----------|-----------|
| **Kikuzuki** | Restaurant | 2 locations — Ao Nang + Krabi Town |
| **Pottery House Krabi** | Experience | 2 locations — main + beachfront |

---

## Theme: Saya

Default theme for all tenants. SSR-rendered, SEO-first, editorial typography. Location-centric with vertical-aware routing.

### URL Structure

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

### Nav

Logo | Locations (dropdown) | Story | Contact | **RESERVE** (primary CTA). Locations dropdown built at runtime from `business_locations`.

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

- **Organization** is the restaurant brand workspace and billing/team boundary.
- **One org can have multiple sites** — there is no unique-per-org constraint on sites. Sites are explicit everywhere — there is no "first site in org" fallback in dashboard routing or billing.
- Each site has its own plan and Stripe subscription (`site_billing`). The Stripe *customer* stays at org level (`organization_billing.stripe_customer_id`) — one payment method covers every site in the org.
- A new site always starts on `free`, even under a paid org. If the org already has another site on a paid plan and a saved card on file, the dashboard offers to auto-subscribe the new site immediately (`POST /api/billing/site-subscribe`, no Checkout redirect). Otherwise it's a normal Checkout upgrade later.
- **Locations** are the persistent dashboard working context within a site, selected from the header on every dashboard page.
- Public tenant routes remain location/experience-centric under `/locations/[slug]` and `/experiences/[slug]`.
- Dashboard routes follow the Vercel-style workspace shape, with an explicit site segment:
  - `/dashboard/{orgSlug}` — org root; lists sites, auto-redirects to the single site if the org has exactly one
  - `/dashboard/{orgSlug}/sites/{siteSlug}` — site workspace (`siteSlug` is the site's `subdomain`)
  - `/dashboard/{orgSlug}/sites/{siteSlug}/{locationSlug}` — location workspace
  - `/dashboard/{orgSlug}/sites/new` — create another site under this org
  - `/dashboard/{orgSlug}/~/settings/billing` — org billing (lists every site's plan/subscription, not just one)
  - `/dashboard/account/settings` — personal account settings
- App-facing dashboard APIs use `/api/dashboard/*`; the active site is resolved server-side from the `x-dashboard-site-slug` header (auto-attached by `plugins/dashboard-site-header.ts` based on the route's `siteSlug`), not by guessing the org's oldest site.
- **Site transfers move only the site** — its locations, content, billing, and entitlements reparent into the recipient's own existing org. The org itself, its other sites, and org-level billing/credits never move.
- Dashboard is home for: billing, org settings, inbox triage (contact, reservations, reviews), managed service work queue, analytics.
