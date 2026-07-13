# KrabiClaw

KrabiClaw is a multi-tenant platform for local business websites managed through dashboard, ChowBot, and MCP surfaces. This glossary names the domain concepts those surfaces share.

## Language

**Professional-service tenant**:
A tenant whose public site sells expertise, consultation, representation, care, or advisory work rather than food, hospitality, retail inventory, or bookable activities. Legal-services tenants are one kind of professional-service tenant. In the current DB schema, Blawby tenants store the existing `service` vertical and select professional-service rendering with `theme_id = 'blawby-theme-v1'`; do not rebuild the historical `sites` table just to add a narrower vertical string.
_Avoid_: legal_service vertical, fake professional_service DB migration, restaurant/experience wording

**Professional-service empty state**:
Fallback or edit-mode copy shown when professional-service tenant content is missing. It may use neutral professional examples in owner-facing edit mode, but public production pages must not leak restaurant, hospitality, retail, or experience wording.
_Avoid_: restaurant fallback, experience fallback, demo tenant copy

**Tenant vertical**:
The business category that controls public copy, route expectations, schema defaults, onboarding language, and verification rules for a tenant. A vertical is broader than a template and must not be used to hardcode one client.
_Avoid_: theme, template, industry flag

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

**Tenant page**:
A URL-bearing public page owned by one tenant, such as a privacy policy, disclaimer, notice, or other static legal/compliance page. Tenant pages are not articles and are not reusable field-level content.
_Avoid_: blog post, site content field, platform page

**Redirect manifest**:
A reviewable import artifact that maps legacy tenant URLs to their intended KrabiClaw destination or retirement behavior. It is the source of truth for preserving SEO and conversion paths during a tenant cutover.
_Avoid_: ad-hoc redirects, implicit route compatibility

**Conversion event**:
A tenant-owned visitor action that indicates commercial or operational intent, such as clicking a consultation CTA. Conversion events are first-party KrabiClaw analytics concepts and may be bridged to configured external analytics destinations.
_Avoid_: raw dataLayer push, custom script snippet

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
Machine-readable schema.org metadata generated from KrabiClaw's tenant, location, offering, article, compliance, and template models. Professional-service structured data may render legal-service concepts, but it is generated from platform data rather than copied as raw tenant JSON-LD.
_Avoid_: pasted JSON-LD blob, restaurant schema fallback, template-only metadata
