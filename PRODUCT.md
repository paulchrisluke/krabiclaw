# KrabiClaw — Product Context

## What It Is

**Shopify for restaurants** — multi-tenant SaaS where restaurant owners get a subdomain site and build their web presence with a visual editor. SSR-rendered, SEO-optimised restaurant websites. AI (ChowBot) manages content via natural language from the dashboard.

---

## Business Model

Pricing managed entirely in Stripe — never duplicated in code. All pricing UI reads from `GET /api/billing/plans`.

| Tier | Key Features |
|------|-------------|
| Free | Subdomain, Saya theme, manual editor, starter AI credits, 1 location |
| Pro | Custom domain + SSL, Google Places sync, more AI credits/mo, unlimited locations |
| Agency | Everything Pro + unlimited sites, white-label, API access |
| Credit top-ups | 3 one-time bundles (500 / 2,500 / 5,000) — never expire |

**Upgrade modal** triggers on: connecting Google Business, adding location 2+, custom domain setup, removing KrabiClaw branding.

---

## Current Clients

- **Kikuzuki** — Japanese restaurant brand, 2 locations (Ao Nang + Krabi Town)

---

## Theme: Saya

Default theme for all tenants. SSR-rendered, SEO-first, editorial typography. Location-centric — all content hangs off `/locations/[slug]/`.

### URL Structure

```
/                              → Home: hero + location entry points + brand feed
/locations                     → All locations grid
/locations/[slug]              → Location home: hours, address, map, menu preview
/locations/[slug]/menu         → Full menu
/locations/[slug]/reviews      → Reviews: aggregate score + star distribution + owner replies
/locations/[slug]/photos       → Photo gallery by category
/locations/[slug]/qa           → Q&A: owner-answered pairs
/locations/[slug]/contact      → Map embed, hours, address, directions CTA
/about                         → Brand story
/contact                       → Brand contact form
/reservations                  → Reservation form
/posts                         → Posts / news feed
/menu                          → Redirects to primary location menu (SEO fallback)
```

### Nav

Logo | Locations (dropdown) | Story | Contact | **RESERVE** (primary CTA). Locations dropdown is built at runtime from `business_locations` table.

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
| Google Places API | ✅ Live — location autocomplete |
| Cloudflare Stream | ✅ Built — video upload/playback |

---

## Architecture

- All AI calls route through Cloudflare AI Gateway — never call model APIs directly
- Posts are the content primitive — channels are adapters on top of `post_channel_jobs`
- All location data is CRUD-available in D1 regardless of GMB connection — GMB sync is additive, not required
- Notification delivery is channel-agnostic — `notifications.channel` column means email/push can be added with no schema change
- WhatsApp and Instagram both go through the same Facebook app — single OAuth covers both
- ChowBot is the owner of AI conversations; dashboard and WhatsApp are interfaces over the same D1-backed backend
- Credit system enforced at the `/api/ai/*` route layer — 402 on exhaustion
