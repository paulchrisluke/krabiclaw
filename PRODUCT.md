# KrabiClaw — Product Context

## What It Is

**Website builder for local and professional-service businesses** — multi-tenant SaaS where owners get a subdomain site and build their web presence completely through conversation with ChatGPT (via MCP) or the dashboard CMS. SSR-rendered, SEO-optimised sites. The ChatGPT plugin is the primary creation surface. Supports the `restaurant`, `experience`, and `service` verticals today, with the model designed to easily accommodate more local-business categories over time.

---

## MCP

KrabiClaw ships one MCP app, the ChatGPT app for site management. Every site is
managed through it, KrabiClaw's own included.

- OAuth2 authorization at `/api/auth/oauth2/` — ChatGPT handles auth before any tool call
- MCP endpoint at `/api/mcp` (`server/api/mcp.post.ts`)
- Scope: `tenant`
- MCP capabilities cover existing site settings, locations, the Product catalog and its collections, posts, articles, media, locale management, feature-flagged Facebook publishing, and analytics. Google Places lookup and domain setup are CMS-only.
- Every public tool rejects unknown top-level arguments and declares explicit `readOnlyHint`, `openWorldHint`, and `destructiveHint` values. `server/utils/mcp-tools/shared.ts` contains the registry.
- Location-scoped mutations require an explicit `location_id`. Product-by-ID mutations resolve the Product's stored owning location.
- `chatgpt-app-submission.json` contains the review import data. Run `yarn chatgpt:submission:write` after changing the public tool catalog.
- Widget system is legacy/deprecated for client uploads; the app asks users to attach files directly in ChatGPT and then calls `upload_user_media` once with the resolved native file.
- Image generation via ChatGPT's native `image_generation` Responses API tool (`gpt-image-1` / `gpt-image-2`) — not DALL-E
- Plugin landing page at `/plugin`

The dashboard is the home for billing, org settings, unified inbox (contact, reservations, bookings, reviews), and analytics. MCP and dashboard operate on the same D1 backend.

See `docs/mcp.md` for the auth model and catalog contract.

---

## KrabiClaw's own site

KrabiClaw's marketing site (`krabiclaw.com`) is an ordinary site row in the
`platform` organization running the **platform template** (`krabiclaw-theme-v1`
in `utils/template-registry.ts`). The platform host resolves it through the same
middleware as every tenant, and its owner works in the same dashboard:

- The blog and the documentation are two **article collections** on that site
  (`blog` and `docs` in `utils/article-collections.ts`). Each collection has a
  fixed category list that shapes its URL (`/blog/{category}/{slug}`,
  `/docs/{category}/{slug}`; a docs article whose slug equals its category
  segment is that category's landing page). Feeds, markdown mirrors, search
  indexing and llms.txt read the collections.
- The `/help` form is that site's contact form and files into its inbox.
- The one platform-only tool is the People page on that site: a Better Auth
  admin lists accounts and impersonates one. Everything about a customer
  (domains, billing, members, inbox) is then that customer's own dashboard.

There is no `/admin`, no second MCP surface, no separate documentation model and
no reserved sentinel identity in code.

---

## Verticals

KrabiClaw supports multiple business verticals. Site creation happens in the dashboard onboarding wizard or multi-site "Add a site" picker, which offer these three choices; MCP manages existing sites.

| Vertical (app-level) | Description | DB-stored as |
|----------|-------------|-------------|
| `restaurant` | Food & beverage — menus, reviews, hours, reservations | `restaurant` |
| `experience` | Activity-based businesses — classes, tours, workshops, bookings | `experience` |
| `service` | Legal and other professional/advisory services — practice areas, consultations, pricing/donate pages | `service` |

`service` is the canonical professional-service vertical across the application, database, and import pipeline.

A restaurant dish, a pottery class and a consultation are all Products in one catalog; nothing about their storage differs. There is no `product_type` discriminator, because a discriminator that selects a schema is how one model became several half-models. Capabilities compose instead: a Product gains booking by having a booking configuration, and gains stock by having an inventory item. What the vertical actually changes is vocabulary (menu vs products) and which route segment the catalogue is presented at.

Professional-service tenants render through the Blawby template (see "Public Templates" below) rather than Saya, and their practice areas are tenant pages rather than a catalog of their own.

---

## Business Model

Recurring amounts and plan IDs are intentionally fixed in the reviewed Stripe
catalog contract (`scripts/lib/stripe-catalog-plan.mjs`). Customer-facing
billing surfaces load the canonical plan details from `GET /api/billing/plans`.

| Tier | Price | Key Features |
|------|-------|-------------|
| Free (Starter) | $0 | Subdomain, Saya theme, manual editor, 1 locale |
| Growth | $49/mo or $588/year | Custom domain + SSL, Google Places imports, post-booking review requests, manual locale editing, Facebook and Instagram publishing |

One Better Auth organization subscription covers every site in the organization.
One-time credit purchases, service add-ons,
and automatic top-ups are retired. The 2026-08-09 production/provider census
found no customer purchase, fulfillment, or outstanding-obligation history for
those products. The active schema removes their unused tables and columns;
immutable applied migrations retain the historical definitions only.

**Upgrade modal** triggers on: Google Places import, custom domain setup, removing KrabiClaw branding.

**Starter and Growth are the complete runtime plan model.** Managed and SEO
Accelerator were created as Stripe catalog products but were never purchased or
subscribed to. They are provider-retirement records only and must be archived;
they are not runtime plan identities, historical entitlements, or fulfillment
obligations.

Growth includes Facebook and Instagram publishing. The internal `managed_service`
entitlement is the capability key that gates those Growth features; it is not a
plan identity and must never appear as one in a checkout, upsell, or catalog
surface. Support for every plan is the `/help` form, which files into KrabiClaw's
own inbox like any tenant contact form.

Pending site handoffs do not pause or delete the source owner's custom domains.
Reminders are informational; payment gates ownership acceptance, not the
current customer's live website. Acceptance and cancellation own the
compare-and-set restoration/cleanup saga, including recovery of legacy paused
domain markers.

### Locale model

Non-source locales are manually authored variants. The editor and MCP expose
explicit locale-variant records; there is no automated translation job, review
queue, or translation entitlement in the active product surface.

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
/locations/[slug]/menu/[slug]  → Dish detail
/locations/[slug]/reviews      → Reviews: aggregate score + star distribution + owner replies
/locations/[slug]/photos       → Photo gallery by category
/locations/[slug]/qa           → Q&A: owner-answered pairs
/locations/[slug]/contact      → Map embed, hours, address, directions CTA
/products                      → All products grid (the experience vertical's catalogue route)
/locations/[slug]/products/[slug] → Product detail: description, price, booking CTA when bookable
/about                         → Brand story
/contact                       → Brand contact form
/reservations                  → Reservation form
/posts                         → Posts / news feed
/menu                          → Site-level menu when published; location menus live under /locations/[slug]/menu
```

Nav: Logo | Locations (dropdown) | Story | Contact | **RESERVE** (primary CTA). Locations dropdown built at runtime from `business_locations`.

### Blawby (service)

Template for professional-service tenants, proven first against NCLS (#194). Practice areas are pages, not a catalog: they are site-level, since many professional-service tenants serve a statewide/remote area rather than a single storefront.

#### URL Structure

```text
/                              → Home
/about                         → Brand story, compliance/organization info
/services                      → Practice-area index
/services/[slug]               → Practice-area page
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
| WhatsApp Business API | ✅ Built — blocked on real number |
| Facebook / Instagram Graph API | ✅ OAuth + Pages sync + publish built |
| Google Places API sync | ✅ Live — hours, address, rating, reviews (up to 5) |
| Google Places API | ✅ Live — CMS location autocomplete and Places lookup |
| Cloudflare R2 media host | ✅ Built — video upload/playback |
| ChatGPT MCP app | ✅ Live — primary customer creation surface |
| ChatGPT image generation | ✅ Live — `gpt-image-1`/`gpt-image-2` via Responses API |

---

## Architecture

- MCP server is the canonical creation surface; dashboard CMS and ChowBot are secondary
- Short updates use `posts`; long-form articles use `blog_posts` with canonical content documents and blocks.
- `posts` owns website publication. `post_channel_jobs` records only Facebook and Instagram delivery outcomes.
- All location data is CRUD-available in D1; Google Places import is additive and read-only with respect to Google
- Notification delivery is channel-agnostic — `notifications.channel` column means email/push can be added with no schema change
- WhatsApp and Instagram both go through the same Facebook app — single OAuth covers both
- ChowBot is the owner of AI conversations; dashboard and WhatsApp are interfaces over the same D1-backed backend
- Image generation: ChatGPT generates natively → `save_generated_image_file` persists via Cloudflare Images → `show_generated_images` renders the widget. Never pass raw base64 to MCP tools.

---

## Dashboard Model

- **Organization** is the site/brand workspace and billing/team boundary — vertical-neutral: an org can hold a restaurant, an experience business, or a professional-service firm, and (per "One org can have multiple sites" below) can even hold a mix.
- **One org can have multiple sites** — there is no unique-per-org constraint on sites. Sites are explicit everywhere — there is no "first site in org" fallback in dashboard routing or billing.
- One Better Auth organization subscription covers every site in the organization. A new site inherits the organization's effective plan without another checkout. `organization_billing` is the slim sessionless access/payment reconciliation projection of that organization-level authority; authenticated billing management reads Better Auth's documented subscription API.
- Capabilities are computed only from `getPlanEntitlements(effectivePlan)`. There are no site plan, site billing, site entitlement, or organization entitlement projections.
- **Sites** are the primary day-to-day dashboard context and selector. A location becomes the working context only inside that site's location workspace. For Saya (restaurant/experience) sites this is a physical location; Blawby's practice areas are site-level and don't require a location to have a public street address (a professional-service tenant may serve a statewide/remote area).
- Public tenant routes are template-specific: Saya remains location-centric under `/locations/[slug]`, with each Product's page beneath the location that offers it; Blawby is page-centric under `/services/[slug]` (see "Public Templates" above).
- Dashboard routes follow the Vercel-style workspace shape, with an explicit site segment:
  - `/dashboard/{orgSlug}` — org root; lists sites, auto-redirects to the single site if the org has exactly one
  - `/dashboard/{orgSlug}/sites/{siteSlug}` — site workspace (`siteSlug` is the site's `subdomain`)
  - `/dashboard/{orgSlug}/sites/{siteSlug}/locations/{locationSlug}` — location workspace
  - `/dashboard/{orgSlug}/sites/new` — create another site under this org
  - `/dashboard/{orgSlug}/settings/billing` — the organization's subscription, invoices, and plan management
  - `/dashboard/account/settings` — personal account settings
- App-facing dashboard APIs use `/api/dashboard/*`; the active org/site are resolved server-side from explicit `org`/`site` query params (attached by `dashboardFetch` in `composables/dashboardFetch.ts` based on the route's `orgSlug`/`siteSlug`), not by guessing the org's oldest site.
- Dashboard is home for: billing, org settings, unified inbox (contact inquiries, reservations, bookings, reviews), analytics.

## Language

**Professional-service tenant**:
A tenant whose public site sells expertise, consultation, representation, care, or advisory work rather than food, hospitality, retail inventory, or bookable activities. Legal-services tenants are one kind of professional-service tenant.

**Tenant vertical (canonical contract)**:
The business category that controls public copy, route expectations, schema defaults, onboarding language, and verification rules for a tenant. A vertical is broader than a template and must not be used to hardcode one client.

`SiteVertical` in `utils/vertical-copy.ts` defines the supported values `restaurant`, `experience`, and `service`. The dashboard, onboarding, import pipeline, template registry, and database use these values directly. `service` covers legal and other professional services; it is not a separate template. Do not introduce storage aliases or a client-specific vertical. Readers must preserve all supported verticals rather than narrowing to restaurant and experience.

**Professional-service empty state**:
Fallback or edit-mode copy shown when professional-service tenant content is missing. It may use neutral professional examples in owner-facing edit mode, but public production pages must not leak restaurant, hospitality, retail, or experience wording.
_Avoid_: restaurant fallback, experience fallback, demo tenant copy

**Template**:
A reusable public-site presentation system for a tenant vertical or family of tenant needs. A template may read shared platform content models, but it must not create a separate business model for the same concept.
_Avoid_: theme when referring to rendered page behavior, hardcoded client site

**Template registry**:
The central mapping from a tenant's selected public template to its layouts, route components, navigation/footer components, copy rules, and supported content models. Template dispatch belongs in the registry, not as scattered vertical checks in public pages.
_Avoid_: page-level template branching, hardcoded tenant routes

**Blawby**:
The first KrabiClaw public template for professional-service tenants, beginning with legal-service sites such as NCLS. Blawby is a reusable template, not NCLS-specific behavior.
_Avoid_: legal template, NCLS template, professional template

**Theme token**:
A reviewed template setting that controls presentation values such as typography, colors, spacing, and radii within a supported public template. Theme tokens are platform data with validation, not arbitrary CSS or custom head code.
_Avoid_: custom CSS, tenant stylesheet, hardcoded client styling

**Practice area**:
A legal-facing page describing an area of expertise or client need, such as family law or immigration help. A practice area is a page, not a catalog row: it is not a Product, a menu item, or a location.
_Avoid_: offering, menu item, experience, legal service table

**Location**:
A tenant presence used for contact, office, service-area, hours, and routing context. For professional-service tenants, a location may omit a public street address when it represents a service-area or remote/contact presence rather than a physical storefront.
_Avoid_: storefront-only location, fake address, required Google Places location

**Dine-in order**:
A guest order intended for on-site fulfillment at a restaurant location, associated with a service point such as a table or pickup zone. It is distinct from a reservation, a delivery order, and a payment transaction.
_Avoid_: restaurant reservation, delivery order, payment

**Anonymous ordering session**:
The Better Auth Anonymous user/session used to provide guest identity and continuity for native ordering without requiring sign-in or PII. Cart and Order records may reference that Better Auth user; KrabiClaw does not create a second guest-session principal or session table. A QR credential separately authorizes the service point and is not the guest identity.
_Avoid_: custom guest session, ordering context, QR as authentication

**Ordering QR credential**:
A generated, revocable QR credential that routes an order to an explicit fixed Service Point, Service Area, or pickup queue. Businesses may print it on any physical medium—card, disk, table marker, sticker, or sign. The medium is presentation, not the domain object; the QR is not a Better Auth identity or session.
_Avoid_: ordering card as the canonical model, QR as guest identity, arbitrary location note as fulfillment routing

**Service Point**:
A location-scoped, user-named physical or operational target for a Dine-in order, such as a table, seat, bar position, patio spot, pickup point, or named service area. The name is presentation; the point’s stable ID and Ordering QR credential provide routing context. It is not a kitchen station or a guest identity.
_Avoid_: fixed bar-seat type, ordering card, QR as authentication, kitchen station

**Ordering menu**:
The interactive menu used by a guest to build and submit Dine-in orders. It is distinct from the SEO/public menu presentation, even when both are generated from the same published Product/Price catalog.
_Avoid_: SEO menu as the cart, menu item as the whole product model, separate catalog for QR ordering

**Product**:
The organization-owned catalog identity and content record for a thing the business sells. One Product model serves every vertical. Product content is separate from where it is published (a site), where it is offered (a location), how it is grouped (a collection), what is bought (a variant), and what it costs (a price on that variant). None of those states implies another: a Product can be carried by a site and withheld, offered at a location with no price, or active with nothing published.
_Avoid_: menu item as the combined product/price/placement model, product_type as a schema selector, a second catalog for one vertical

**Variant**:
What a customer actually buys: a Product's size, seating, or option combination. Prices belong to variants, because two sizes are two things to buy and not one thing with two amounts. A Product sold one way still has one variant, so every price has an owner.
_Avoid_: price on the product, option strings priced by convention

**Collection**:
A named, ordered grouping a site presents — a menu section, a shelf, a curated "Featured" row. Membership is explicit, and position lives on the membership, so one Product can sit third in one collection and first in another. There is no `featured` flag on a Product: a curated grouping is a Collection whose membership someone chose.
_Avoid_: product category, featured flag, implicit "everything else" bucket

**Price**:
What one variant costs, in one currency, optionally narrowed to one location and one validity interval. A price stores an integer minor-unit amount, ISO currency, billing type (one-time or recurring), tax behavior, optional compare-at amount, and its validity interval. Selection has exactly one rule: a location-specific price wins over a location-neutral one for that location, and two simultaneously valid prices of the same scope are a conflict the writer refuses rather than a choice the reader makes. Zero is a real free price; a variant with no applicable price is not purchasable there, which the surface states. A site's default currency is only a creation default and never rewrites existing prices.
_Avoid_: price on the product, mutable price field on an immutable order, a "from" amount standing in for a real price

**Session**:
One occurrence of a bookable Product: a real row with its own start instant, zone, capacity and state. Sessions are materialized from typed availability rules rather than computed at read time, so what a guest is offered and what a host sees are the same rows. A booking claims seats on a session; a bookable Product with no sessions offers nothing, which is different from not being bookable at all.
_Avoid_: experience as a separate catalog identity, recurrence JSON read as a schedule, a slot computed per request

**Reservation**:
A table held at a location for an interval. A reservation has no materialized occurrence — a restaurant does not schedule dinners the way a studio schedules classes — so its slots are computed from the location's opening hours and date overrides, and capacity is per start-time slot. Reservations and bookings are separate because what holds the seats differs, not because the guest conversation does.
_Avoid_: session as a reservation, reservation as a booking with a null product

**Organization access projection**:
The slim, sessionless application projection of subscription access used by cron and queue work. Better Auth is the subscription authority and authenticated billing management reads its documented subscription APIs; `organization_billing` stores only payment/reconciliation evidence, the correlated subscription ID, `access_plan`, and `access_expires_at`. Capabilities are derived from `getPlanEntitlements(effectivePlan)` rather than persisted entitlement rows.
_Avoid_: site billing, site entitlement, mutable capability projection, direct runtime SQL against Better Auth tables

**Organization activity event**:
An auditable organization-owned action stored in `organization_events`. `organization_id` is required; `site_id` and `location_id` are nullable so membership, invitations, and organization-only work can be represented without assigning an arbitrary primary site. Site dashboards show their scoped activity, while the organization feed includes both organization-only and site events.
_Avoid_: site event for organization-only work, arbitrary primary-site resolution, conversion click duplicated into activity

**KrabiClaw's own site**:
The site row running the platform template, owned by the `platform` organization and resolved for the platform host through the ordinary site lookup. Its blog, documentation, redirects and analytics use the same site-scoped tables and code paths as every tenant.
_Avoid_: sentinel site ids, a null platform scope, a parallel admin content model, a second MCP surface

**Article collection**:
The group an article belongs to on a site: `blog` everywhere, plus `docs` on KrabiClaw's own site. The collection decides the URL prefix and the fixed category list; the article model, editor, feeds and markdown routes are shared.
_Avoid_: a documentation document kind, pages standing in for documentation, per-collection editors

**Order round**:
One immutable guest submission from the current Cart. Multiple Order rounds may accumulate on one open Invoice/check; each round is independently delivered to the merchant handoff and independently idempotent.
_Avoid_: one order per prep station, a new guest session per round, separate invoice for every round

**Invoice/check**:
The canonical running commercial record that groups Order rounds, line items, tax, service charge, discounts, payments, and balance. “Check” is the customer/venue presentation; `Invoice` is the canonical commerce term. It may remain a draft/open unpaid check while the guest continues ordering.
_Avoid_: payment transaction as the order, payment pending as the invoice lifecycle, separate check for each round

**Merchant handoff**:
The boundary where KrabiClaw delivers a canonical restaurant order to one configured external operational receiver and mirrors the receiver’s status. It follows the Uber Eats restaurant integration pattern—notify/fetch, accept or deny, ready-time, ready, cancel, complete—and stops before the receiver’s POS/KDS/kitchen workflow.
_Avoid_: native KDS, station router, fallback kitchen queue, automatic alternate receiver

**Integration destination**:
One location-scoped, Better Auth-authorized external receiver for native order handoff. A location has one active merchant handoff destination and fails closed when it cannot receive orders; KrabiClaw does not silently fail over to another destination.
_Avoid_: provider enum as the order model, multiple automatic receivers, fallback routing

**Tenant page**:
A URL-bearing public page owned by one tenant, such as a privacy policy, disclaimer, notice, or other static legal/compliance page. Tenant pages are not articles and are not reusable field-level content.
_Avoid_: blog post, site content field, platform page

**Blog post**:
Editorial content owned by either the platform or one tenant. A blog post has a draft, published, or scheduled lifecycle and one public path. Platform and tenant repositories share the post contract but keep their authorization transports separate.
_Avoid_: platform blog input for shared post data, tenant page, documentation page

**Redirect manifest**:
A reviewable import artifact that maps legacy tenant URLs to their intended KrabiClaw destination or retirement behavior. It is the source of truth for preserving SEO and conversion paths during a tenant cutover.
_Avoid_: ad-hoc redirects, implicit route compatibility

**Conversion event**:
A tenant-owned visitor action that indicates commercial or operational intent, such as clicking a consultation CTA. Conversion events are first-party KrabiClaw analytics concepts and may be mirrored to configured external analytics destinations.
_Avoid_: tenant-specific tracking hook, custom script snippet

**Site-level review**:
Approved customer feedback about a tenant as a whole rather than one location. A site-level review has no location association but still requires a 1-5 rating.
_Avoid_: testimonial, locationless location review, synthetic review

**Owner-entered review**:
A review collected outside KrabiClaw and entered by an authorized tenant owner with its collection method, attribution, and publication-authority attestation. It is not a verified review unless KrabiClaw collected it directly.
_Avoid_: verified review, unattributed testimonial, ghost review

**Site-level Q&A**:
An owner-maintained question and answer that applies to the tenant as a whole rather than one location. It shares KrabiClaw's Q&A workflow but has no location association.
_Avoid_: location FAQ, Blawby FAQ, static testimonial question

**Consultation**:
A professional-service intake or appointment path for a prospective client. A consultation may be handled by KrabiClaw-native booking or by an external URL, but it is not a restaurant reservation or an experience booking.
_Avoid_: table reservation, experience booking, Calendly-specific booking

**Confirmation page**:
A noindex public success page shown after a visitor submits a contact, reservation, booking, consultation, or other tenant form. Confirmation pages may use short-lived client-side handoff details when available, but they must still render a safe generic success state when the handoff is missing.
_Avoid_: thank-you route as the domain concept, indexed success page, URL-only receipt

**Tenant compliance**:
Tenant-owned legal, regulatory, entity, nonprofit, disclaimer, and notice information that can be rendered by templates and linked from public pages. Tenant compliance is platform data, not legal-template configuration.
_Avoid_: template disclaimer fields, hardcoded legal footer

**Pricing page**:
A tenant-owned public page that explains pricing, payment paths, aid tiers, or service costs. A pricing page may include static sections and optional configured components, but it is not a native payment processor by itself.
_Avoid_: Stripe checkout page, donation page, hardcoded client pricing

**Calculator component**:
An optional configured content component that helps visitors estimate eligibility, cost, or fit using reviewed tenant-specific rules. A calculator component is not arbitrary client-side code.
_Avoid_: custom script, hidden NCLS logic, payment calculation

**Cutover gate**:
A required verification boundary before moving a tenant's production DNS to KrabiClaw. Passing the cutover gate means the agreed route, SEO, media, tracking, content, redirect, and editing checks have passed.
_Avoid_: smoke test, visual approval, soft launch

**Structured data**:
Machine-readable schema.org metadata generated from KrabiClaw's tenant, location, Product, article, compliance, and template models. Professional-service structured data may render legal-service concepts, but it is generated from platform data rather than copied as raw tenant JSON-LD. `utils/professional-service-schema.ts` is the single canonical graph builder for professional-service tenants (see ADR 0016): every route emits a linked `@graph` with stable, canonical-origin `Organization`/`WebSite` `@id`s, `nonprofit_status` is normalized to schema.org's enum (e.g. `https://schema.org/Nonprofit501c3`) at the write layer rather than stored as free text, and a `PostalAddress` is only included when `tenant_compliance.address_visibility` explicitly allows it — resolved from the page's explicit `business_locations` owner. The shared Organization node has no postal address.
_Avoid_: pasted JSON-LD blob, restaurant schema fallback, template-only metadata, free-text nonprofit status, a second address field on `tenant_compliance`

---

## Retained architecture decisions

### Linked professional-service structured data graph

Professional-service tenants get a schema.org graph generated from canonical data, never from pasted JSON-LD. `utils/professional-service-schema.ts` (`buildProfessionalServiceGraph`) is the single builder used by the public pages, dashboard, ChowBot, MCP and import, so every route is independently valid and checkable. `nonprofit_status` is normalized to schema.org's canonical enum. `tenant_compliance.address_visibility` gates whether a resolved street address appears at all; organizations have no postal address, and a practice-area page linked to a location may publish that location's `PostalAddress` on its service node. Rejected: a layout-level Organization block referenced by `@id` (couples every route's validity to the layout) and duplicate address columns on `tenant_compliance` (two sources of truth).

### Restaurant ordering stops at the merchant handoff

Native ordering follows the Uber Eats restaurant integration model (issue #248). KrabiClaw owns the guest QR experience, the published Product/Price catalog, the ordering menu, cart, order rounds, invoice/check, payment records and inventory/availability. Each location has one active, Better Auth-authorized integration destination; if it cannot receive orders, checkout fails closed. The handoff flow is notification → authoritative order retrieval → accept/deny → ready-time update → ready → cancel/complete, delivered as verified, idempotent, version-aware push events (no polling). Native KDS, station routing, printers, kitchen tickets, POS replacement, automatic failover and retail-style substitutions are outside the boundary. Sellable amounts come only from immutable, scoped `prices` rows in integer minor units; experiences are one-to-one Product extensions sharing the stable ID.
