# KrabiClaw — Product Context & Roadmap

## What It Is

**Shopify for restaurants** — a multi-tenant SaaS where restaurant owners sign up free, get a subdomain site, and build their web presence with a visual editor. SSR-ready, SEO-optimized restaurant websites powered by Google Business data.

---

## Business Model

| Tier | Price | Features |
|------|-------|---------|
| Free | $0 | Subdomain (`name.krabiclaw.com`), Saya theme, manual editor, 500 AI credits on signup |
| Paid | ~$25/mo | Custom domain (BYOD), SSL via Cloudflare, Google Business sync, 5,000 AI credits/mo |
| Upsell (TBD) | TBD | AI agent site management, image/video generation, Instagram/Facebook sync, additional themes, Tenant MCP |

---

## Current Clients

- **Client 1**: Japanese restaurant brand, 2 locations, both invited to Google Business

---

## Theme: Saya

- Default theme for all tenants
- SSR-rendered, SEO-first
- Inline editor for manual content updates
- Google Business data auto-populates content when connected
- Posts section (`SayaPosts`) fed by platform `posts` table (+ GMB fallback when connected)

---

## Integration Status

| Integration | Status |
|-------------|--------|
| Google OAuth (login) | ✅ Live |
| WhatsApp OTP login | ✅ Built — blocked on real number registration (see TODO.md) |
| Stripe (billing) | ✅ Live |
| Cloudflare AI Gateway | ✅ Live — menu extraction, post generation, credit billing |
| WhatsApp Business API | ✅ Notifications built — blocked on real number (test number rejects custom templates) |
| Facebook / Instagram Graph API | ✅ App created — channel adapter stub ready in post_channel_jobs |
| Google Business Profile API | ⏳ API approval pending; GMB channel adapter stub ready in post_channel_jobs |
| Google Places API (New v1) | ✅ Live — location autocomplete in onboarding + Add Location modal |

---

## D1 Database — 32 Tables

Key tables added during this build cycle:
- `ai_credits` / `ai_usage_log` — credit billing, usage tracking, CF Gateway log reconciliation
- `notifications` — channel-agnostic outbound notification log
- `contact_submissions` / `reservation_submissions` — Saya theme form submissions
- `posts` / `post_channel_jobs` — post source of truth + per-channel distribution queue
- `user.phoneNumber` / `user.phoneNumberVerified` — WhatsApp OTP login columns

---

## Build Roadmap

### ✅ 1. Cloudflare AI Gateway + Menu Extraction
**Status: Live (PR #4)**

- All model calls route through CF AI Gateway (`krabiclaw` gateway, Anthropic provider key stored in CF)
- `server/utils/ai-gateway.ts` — CF Gateway wrapper with metadata tracing
- `server/utils/ai-credits.ts` — credit check/deduct, 500 free on signup, 5× output token weighting
- `POST /api/ai/[siteId]/menu/extract` — vision extraction from photo/image, saves as draft, charges credits
- `AiMenuImport.vue` — multi-step modal: upload → extract → review/edit → save draft
- Draft-first always — owner must publish explicitly, AI never auto-publishes

**Credit model:** 1 credit = 1,000 normalized tokens. Free: 500. Paid: 5,000/mo. Markup: 2–3× Anthropic cost. CF Gateway is the single metering point — `cf_gateway_log_id` stored for nightly reconciliation.

---

### ✅ 2. WhatsApp Notification Foundation
**Status: Live (PR #5) — sends blocked until real number registered**

- `server/utils/whatsapp.ts` — Meta Cloud API v25.0, E.164 normalization, template dispatch, delivery logging
- `notifications` table — channel-agnostic (add email later without schema change)
- 7 templates defined in code: `draft_published`, `new_review`, `ai_action_complete`, `low_credits`, `new_contact_msg`, `new_reservation`, `otp_code`
- Triggers wired: content publish, AI extraction complete, low credits, contact form, reservation form
- Site Settings → Notifications: owner enters their WhatsApp number (stored in `site_config`)
- `contact_submissions` / `reservation_submissions` tables; Saya contact + reservation forms fully wired

**Blocked:** Test phone number (ID `1070814412788109`) rejects all custom templates. Need real number registered in WhatsApp Manager. See TODO.md — 7 templates to submit once unblocked.

---

### ✅ 3. WhatsApp OTP Login
**Status: Built (PR #6) — OTP delivery blocked until real number registered**

- Better Auth `phoneNumber` plugin configured — `sendOTP` callback calls `sendWhatsAppOtp`
- Login page: two-step phone → 6-digit code flow alongside Google OAuth
- `user.phoneNumber` + `user.phoneNumberVerified` columns in D1
- `otp_code` template: AUTHENTICATION category, submit to Meta once real number registered

---

### ✅ 4. Posts Foundation + AI Composer
**Status: Built (PR pending merge)**

Posts are a platform primitive — live in our system first, pushed to channels as adapters.

- `posts` table — source of truth (title, body, image_url, status, scheduled_for)
- `post_channel_jobs` table — one row per channel per publish; drains when channel connects
- **Editor API:** full CRUD + publish at `/api/editor/sites/[siteId]/posts/...`
- **Public API:** `GET /api/public/sites/[siteId]/posts` — SayaPosts-compatible format
- **AI generation:** `POST /api/ai/[siteId]/posts/generate` — prompt + optional photo → Claude drafts title + body via CF AI Gateway, uses credit system
- **Posts dashboard page:** AI composer (prompt + photo attach), draft list (all/draft/published tabs), inline editor, channel selector (Site live, GMB/IG/FB labeled "Not connected"), live preview
- **Site channel:** publishes immediately on confirm. Social channels sit as `pending` in `post_channel_jobs` until adapters built.

**The owner flow:** "Make a NYE post about this photo" → attach photo → Generate → review draft → edit if needed → Publish.

---

### ✅ 5. Google Places Autocomplete
**Status: Live**

- `server/utils/google-places.ts` — `searchPlaces()` + `getPlaceDetails()` using Places API v1 with billing-aware field masks
- `POST /api/places/search` + `GET /api/places/[placeId]` — auth-gated server proxies (key never exposed to client)
- **Onboarding Step 2** — "Find on Google" search auto-fills location name, city, phone, address, maps URL, website, and opening hours; location name also pre-fills from restaurant name; phone now optional
- **Add Location modal** (Locations dashboard) — same autocomplete, same auto-fill
- Key stored as `GOOGLE_PLACES_API_KEY` CF Pages secret + local `.env` / `.dev.vars`

**Billing:** Basic + Contact + Atmosphere fields fetched in one call per selection (~$0.025/lookup). Search is text search (~$0.017/call). Only called on explicit user action — no background polling.

---

### 🔲 6. Sidekick — Dashboard AI Chat Agent

**What it is:** A Shopify Sidekick-style toggleable chat panel on every dashboard page. The owner types a natural language request — "make a NYE post about this photo", "update the salmon price to ฿320", "what happened last week?" — and the AI takes action, shows what it's doing, and asks for confirmation before publishing.

**How it works (tool use / function calling):**
- Single `POST /api/ai/[siteId]/agent` streaming endpoint
- Injects site context: current page, site name, plan tier, credit balance
- Claude is given tool definitions mapping to our existing API routes: `create_post`, `publish_post`, `get_posts`, `extract_menu`, `get_menu`, `update_content`, `get_site_stats`
- Claude decides which tools to call → we execute against existing APIs → feed results back → Claude streams the response
- Draft-first always: Claude creates drafts and asks for approval before publishing

**UI:** `UChatMessage` + `UChatMessages` + `UChatPrompt` + `UChatTool` + `UChatReasoning` — all available in Nuxt UI v4.7.1 free tier. Toggle button in `UDashboardNavbar`, opens a right-side slide-over panel. `UChatTool` renders each tool call inline ("Creating draft post…", "Extracting 12 menu items…").

**KrabiClaw differentiator vs Shopify Sidekick:** Ours is also WhatsApp-native. Once Priority 3's number blocker is resolved, owners can chat with the agent via WhatsApp (same tools, same draft-first flow) — something Shopify can't replicate without our existing Meta Business Account foundation.

**Billing:** Agent actions charge credits at the same rate as direct AI actions. A multi-tool conversation (generate post + publish to channels) charges once per LLM call, not per tool.

---

### 🔲 7. Social Channel Adapters (GMB, Instagram, Facebook)

Build the drain workers for `post_channel_jobs`. Each adapter is a function: `publishToChannel(post, channelJob)` → calls the external API → marks job `published` or `failed`.

- **GMB:** waiting on API approval. Worker queries `post_channel_jobs WHERE channel='gmb' AND status='pending'`, calls GMB Posts API, marks published.
- **Instagram/Facebook:** Meta Graph API. Same pattern. Entitlement-gated (paid plan). Single OAuth connection covers both (same Facebook app).
- When a channel connects, the backlog of pending jobs drains automatically.

---

### 🔲 8. Tenant MCP / API

Per-tenant API key system so restaurant owners can connect their own AI (Claude, ChatGPT) to manage their site via MCP. Most complex, most premium. Build last once agent actions are proven and used by real clients.

---

## Key Architectural Notes

- All AI calls route through Cloudflare AI Gateway — never call model APIs directly
- Posts are the content primitive — channels are adapters on top of `post_channel_jobs`
- Notification delivery is channel-agnostic — `notifications.channel` column means email can be added with no schema change
- WhatsApp and Instagram both go through the same Facebook app — single OAuth covers both
- Agent actions write through existing editor APIs, never bypass them — keeps audit trail and draft/publish workflow intact
- Credit system enforced at the `/api/ai/*` route layer — 402 on exhaustion with upgrade prompt
