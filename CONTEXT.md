# KrabiClaw

KrabiClaw is a multi-tenant platform for local business websites managed through dashboard, ChowBot, and MCP surfaces. This glossary names the domain concepts those surfaces share.

## Language

**Professional-service tenant**:
A tenant whose public site sells expertise, consultation, representation, care, or advisory work rather than food, hospitality, retail inventory, or bookable activities. Legal-services tenants are one kind of professional-service tenant.

**Tenant vertical (canonical contract)**:
The business category that controls public copy, route expectations, schema defaults, onboarding language, and verification rules for a tenant. A vertical is broader than a template and must not be used to hardcode one client.

There is exactly one canonical app-level vertical value set — `SiteVertical` in `utils/vertical-copy.ts` (`ALL_VERTICALS`: `restaurant` | `experience` | `professional_service`) — and a normalization boundary bridging it to the DB storage representation:

- **Write direction**: `server/utils/site-creation.ts`'s `toStoredVertical()` maps app-level `professional_service` → DB-stored `service` at the single place that writes `sites.vertical` (`runSiteCreation()`). Every other stored value (`restaurant`, `experience`) passes through unchanged.
- **Read direction**: `utils/vertical-copy.ts`'s `normalizeVertical()` maps stored `service` → app-level `professional_service` for every reader. `checklist.get.ts` and the public template registry (`utils/template-registry.ts`) already funnel through this.
- `service` is the canonical DB-storage value for the `professional_service` domain vertical, not a second first-class vertical. Do not add a `legal_service` vertical. The two-value bridge above resolves the storage/domain naming boundary; change it only as an explicit domain and schema decision.
- Any new code that reads a raw `sites.vertical`/`site.vertical` value must either call `normalizeVertical()` first, or explicitly check both the app value and its DB alias (the pattern already used in `server/api/public/sites/[siteId]/contact.post.ts`) — never narrow it to a local `'restaurant' | 'experience'` (or similar two-value) union. That exact narrowing previously caused the transfer-onboarding flow to silently display every `service`/`professional_service` site as `restaurant`; #277 fixed the known instances and added a repository-search test guard (`tests/unit/vertical-union-guard.test.ts`) against reintroducing one in shared onboarding/dashboard code.
_Avoid_: legal_service vertical, casually adding a literal `professional_service` storage value, a local `'restaurant' | 'experience'` (or similar) two-value vertical union outside the allowlisted legacy files, theme, template, industry flag

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
A legal-facing name for an offering that describes an area of expertise or client need, such as family law or immigration help. Practice areas are not restaurant menus, bookable experiences, or locations.
_Avoid_: menu item, experience, location

**Offering**:
A reusable professional-service content item describing something a tenant can help a client with. Offerings are site-level by default and may optionally be associated with a location; legal templates may label offerings as practice areas.
_Avoid_: experience, menu item, legal service table

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
The stable catalog identity and content record for a sellable offering. Product content is separate from Menu placement, location/channel availability, inventory quantity, and Price records.
_Avoid_: menu item as the combined product/price/placement model

**Price**:
The sellable monetary definition for a Product, including amount, currency, tax behavior, and active/versioned validity. Order lines snapshot the Price and displayed values; changing an amount creates a new sellable Price rather than rewriting historical order data.
_Avoid_: mutable price field on an immutable order, sale as an untracked total override

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
Machine-readable schema.org metadata generated from KrabiClaw's tenant, location, offering, article, compliance, and template models. Professional-service structured data may render legal-service concepts, but it is generated from platform data rather than copied as raw tenant JSON-LD. `utils/professional-service-schema.ts` is the single canonical graph builder for professional-service tenants (see ADR 0016): every route emits a linked `@graph` with stable, canonical-origin `Organization`/`WebSite` `@id`s, `nonprofit_status` is normalized to schema.org's enum (e.g. `https://schema.org/Nonprofit501c3`) at the write layer rather than stored as free text, and a `PostalAddress` is only included when `tenant_compliance.address_visibility` explicitly allows it — resolved from `business_locations` (the site's primary location, or an offering's own associated location), not duplicated into compliance data.
_Avoid_: pasted JSON-LD blob, restaurant schema fallback, template-only metadata, free-text nonprofit status, a second address field on `tenant_compliance`
