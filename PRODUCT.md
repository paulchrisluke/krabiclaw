# KrabiClaw — Product Context & Roadmap

## What It Is

**Shopify for restaurants** — a multi-tenant SaaS where restaurant owners sign up free, get a subdomain site, and build their web presence with a visual editor. SSR-ready, SEO-optimized restaurant websites powered by Google Business data.

---

## Business Model

| Tier | Price | Features |
|------|-------|---------|
| Free | $0 | Subdomain (`name.krabiclaw.com`), Saya theme, manual editor, 500 AI credits/mo, 1 location |
| Pro | $29/location/mo · $249/location/yr | Custom domain + SSL, Google Business sync, 5,000 AI credits/mo, unlimited locations |
| Agency | $99/mo · $990/yr | Everything in Pro + unlimited sites, white-label, API access, 50,000 AI credits/mo |
| Upsell (TBD) | TBD | Instagram/Facebook sync, additional themes, Tenant MCP |

**Upgrade modal triggers** (shown inline when owner hits a paid feature):
- Connecting Google Business Profile
- Adding a second location
- Custom domain setup
- Removing KrabiClaw branding
- Buying additional AI credits

---

## Current Clients

- **Client 1**: Kikuzuki — Japanese restaurant brand, 2 locations (Ao Nang + Krabi Town)

---

## Theme: Saya

- Default theme for all tenants
- SSR-rendered, SEO-first, editorial typography
- Location-centric navigation — all content hangs off `/locations/[slug]/`
- Google Business data auto-populates content when connected; all fields manually editable without GMB
- ChowBot AI manages all content via natural language from the dashboard

### Saya URL Structure

```
/                              → Home: hero + location entry points + brand feed
/locations                     → All locations grid
/locations/[slug]              → Location home: hours, address, map, menu preview, sub-nav
/locations/[slug]/menu         → Full menu (sections + item grid)
/locations/[slug]/reviews      → Reviews: aggregate score + star dist + owner replies
/locations/[slug]/photos       → Photo gallery by category
/locations/[slug]/qa           → Q&A: owner-answered pairs
/locations/[slug]/contact      → Map embed, hours table, address, directions CTA
/about                         → Brand story
/contact                       → Brand contact form
/reservations                  → Reservation form
/posts                         → All posts / news feed
/menu                          → Redirects to primary location menu (SEO fallback)
```

### Nav structure
- Logo | Locations (dropdown — each location links to `/locations/[slug]/menu`) | Story | Contact | **RESERVE** (primary CTA)
- Mobile: hamburger with same links + per-location menu entries
- "Locations" dropdown is dynamic — built at runtime from `business_locations` table

### Upgrade modal
- `UModal` triggered by `useUpgradeModal()` composable
- Fires when: connecting GMB, adding location 2+, setting custom domain, removing branding
- Content: feature benefit, plan comparison, Stripe checkout CTA
- Dismissable; re-triggers on next attempt if not upgraded

---

## Integration Status

| Integration | Status |
|-------------|--------|
| Google OAuth (login) | ✅ Live |
| WhatsApp OTP login | ✅ Built — blocked on real number registration |
| Stripe (billing) | ✅ Live |
| Cloudflare AI Gateway | ✅ Live — menu extraction, ChowBot agent, credit billing |
| WhatsApp Business API | ✅ Notifications built — blocked on real number |
| Facebook / Instagram Graph API | ✅ App created — channel adapter stub ready |
| Google Business Profile API | ⏳ API approval pending; GMB channel adapter stub ready |
| Google Places API (New v1) | ✅ Live — location autocomplete in onboarding + Add Location modal |

---

## D1 Database — 34 Tables

Key tables added during this build cycle:
- `ai_credits` / `ai_usage_log` — credit billing, usage tracking, CF Gateway log reconciliation
- `notifications` — channel-agnostic outbound notification log
- `contact_submissions` / `reservation_submissions` — Saya theme form submissions
- `posts` / `post_channel_jobs` — post source of truth + per-channel distribution queue (location-scoped, post_type, CTA, event/offer fields)
- `location_photos` — per-location photo gallery, GMB-synced or manually uploaded, categorised (EXTERIOR/INTERIOR/FOOD/MENU/TEAM)
- `location_qa` — per-location Q&A pairs, GMB-synced or manually authored, owner-answered flag
- `user.phoneNumber` / `user.phoneNumberVerified` — WhatsApp OTP login columns
- `business_locations` extended: description, short_description, special_hours, price_level, attributes, email, social URLs, google_place_id
- `reviews` extended: google_review_id, owner_reply, owner_reply_at, photo_urls, reviewer_photo_url

Removed: `staff_profiles`, `awards_recognition` (no GMB source, no routes)

---

## Build Roadmap

### ✅ 1. Cloudflare AI Gateway + Menu Extraction
**Status: Live (PR #4)**

- All model calls route through CF AI Gateway (`krabiclaw` gateway, Anthropic provider key stored in CF)
- `server/utils/ai-gateway.ts` — CF Gateway wrapper with metadata tracing
- `server/utils/ai-credits.ts` — credit check/deduct, 500 free on signup, 5× output token weighting
- `POST /api/ai/[siteId]/menu/extract` — vision extraction from photo/image, saves as draft, charges credits
- Draft-first always — owner must publish explicitly, AI never auto-publishes

**Credit model:** 1 credit = 1,000 normalized tokens. Free: 500. Paid: 5,000/mo. Markup: 2–3× Anthropic cost.

---

### ✅ 2. WhatsApp Notification Foundation
**Status: Live (PR #5) — sends blocked until real number registered**

- 7 templates: `draft_published`, `new_review`, `ai_action_complete`, `low_credits`, `new_contact_msg`, `new_reservation`, `otp_code`
- **Blocked:** Test number rejects custom templates. Need real number in WhatsApp Manager.

---

### ✅ 3. WhatsApp OTP Login
**Status: Built (PR #6) — OTP delivery blocked until real number registered**

---

### ✅ 4. Posts Foundation + AI Composer
**Status: Live**

- `posts` table — source of truth, location-scoped, supports standard/offer/event/update post types with CTA, event dates, offer coupon/terms
- `post_channel_jobs` — one row per channel per publish
- AI generation via CF Gateway, credit-billed
- Site channel live; GMB/IG/FB sit as `pending` until channel adapters built

---

### ✅ 5. Google Places Autocomplete
**Status: Live**

- Onboarding + Add Location modal: search auto-fills all location fields from Google Places v1

---

### ✅ 6. ChowBot — Dashboard AI Chat Agent
**Status: Live**

A Shopify Sidekick-style chat panel on every dashboard page. Owner types natural language → ChowBot takes action via 30 tools → streams live tool indicators → confirms before publishing.

**30 tools covering:**
- Posts: list, create (all types + CTA/event/offer), publish
- Menus: full CRUD + batch add + image_url on items
- Locations: list, create, update (all fields including socials/description/price_level)
- Reviews: read with star distribution, add owner reply
- Photos: list, add, delete per location
- Q&A: list, add, delete per location
- Submissions: read contact + reservation submissions
- Site: rename (syncs subdomain), stats

**SSE streaming** — tool indicators appear live as each tool runs.
**Dev bypass** — no credits charged in `NODE_ENV=development`.
**WhatsApp-native** — same tools will be exposed via WhatsApp once number is registered.

---

### ✅ 7. GMB Data Parity — Full CRUD in D1
**Status: Live (feat/gmb-data-schema)**

Every field GMB provides is now manually editable in D1. GMB sync populates fields when connected; owners fill them in manually without GMB. New tables: `location_photos`, `location_qa`. Extended: `reviews`, `posts`, `business_locations`.

**Public APIs** per location slug: `/reviews`, `/photos`, `/qa`
**Editor CRUD** per location: photos (CRUD), Q&A (CRUD), reviews patch (owner reply)
**Submissions read** routes for dashboard: contact + reservation

---

### ✅ 8. Saya Sub-pages: Reviews, Photos, Q&A, Contact
**Status: Live (PR #9)**

- `/locations/[slug]/reviews` — aggregate score + star distribution histogram, filter chips, review cards with photo strips and owner replies
- `/locations/[slug]/photos` — category tabs with counts, CSS masonry gallery, keyboard-nav lightbox via UModal
- `/locations/[slug]/qa` — owner-answered first, Instrument Serif Q/A markers, upvote counts
- `/locations/[slug]/contact` — map embed, hours table, address, directions CTA (added in PR #9, not originally planned)

---

### 🔲 9. Upgrade Modal
**Status: Composable built — modal UI not wired**

`useUpgradeModal()` composable exists (`composables/useUpgradeModal.ts`) with open/close state. The UModal component with plan comparison and Stripe checkout CTA is not yet built or rendered anywhere.
Triggers: GMB connect, location 2+, custom domain, remove branding, buy credits.

---

### 🔲 10. Social Channel Adapters (GMB, Instagram, Facebook)
**Status: Stubs ready — waiting on API approval (GMB) and OAuth (IG/FB)**

Drain workers for `post_channel_jobs`. Each adapter: `publishToChannel(post, channelJob)` → external API → mark published/failed.

---

### 🔲 11. Tenant MCP / API
**Status: Planned — build last**

Per-tenant API key system so restaurant owners can connect their own AI to manage their site via MCP.

---

## Key Architectural Notes

- All AI calls route through Cloudflare AI Gateway — never call model APIs directly
- Posts are the content primitive — channels are adapters on top of `post_channel_jobs`
- All location data is CRUD-available in D1 regardless of GMB connection — GMB sync is additive, not required
- Notification delivery is channel-agnostic — `notifications.channel` column means email/push can be added with no schema change
- WhatsApp and Instagram both go through the same Facebook app — single OAuth covers both
- Agent (ChowBot) actions write through existing editor APIs — keeps audit trail and draft/publish workflow intact
- Credit system enforced at the `/api/ai/*` route layer — 402 on exhaustion with upgrade prompt
- `layout: 'saya'` is the correct layout name for all Saya theme pages — `tenant` is dead
