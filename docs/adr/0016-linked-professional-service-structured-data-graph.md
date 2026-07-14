# Linked Professional-Service Structured Data Graph

Professional-service tenants need a schema.org graph generated from canonical platform data rather than pasted tenant JSON-LD, with a stable, linked shape (Organization/WebSite plus route-specific nodes) so every route — home, services index/detail, about, contact, schedule, pricing, donate, blog index/article, and tenant pages — is consistent and machine-checkable at the NCLS cutover gate. The generator must stay reusable for any professional-service vertical, not hardcoded to NCLS or legal services.

`utils/professional-service-schema.ts` is the single canonical builder (`buildProfessionalServiceGraph`), called by the `useProfessionalServiceSchema`/`useBlawbyOrgIdentity` composables for public rendering. It is framework-free so it can also be exercised directly by unit tests and reasoned about independently of Nuxt. Every page emits its own complete `@graph` (Organization + WebSite + route-specific nodes) with deterministic, canonical-origin `@id`s (`{origin}/#organization`, `{origin}/#website`), rather than a single layout-level block referenced by ID from separate per-page scripts — this matches the existing `useContentPageSchema` platform-blog pattern and keeps each page's JSON-LD independently valid.

`nonprofit_status` is normalized to schema.org's canonical enum (e.g. `https://schema.org/Nonprofit501c3`) by `normalizeNonprofitStatus()`, called both at the canonical write layer (`server/utils/professional-services-editor.ts`, shared by dashboard, ChowBot, and MCP) and defensively in read/render — free text like `"501(c)(3)"` is rejected/normalized at write time, never stored or emitted as-is.

## Address threading

`tenant_compliance.address_visibility` (`visible`/`hidden`) gates whether a resolved street address is included in the graph at all; the address data itself is read from the existing `business_locations` table (`address`, `city` columns) rather than duplicated into `tenant_compliance`, since address data is not compliance metadata and `business_locations` already exists as the canonical location model.

- **Org-level address**: the primary active `business_locations` row (`is_primary` first, then deterministic title/id ordering) supplies the org-level `PostalAddress` on the shared Organization node that appears on every page, gated by `tenant_compliance.address_visibility`.
- **Offering-level address**: an offering associated with its own location (`offerings.location_id`) can carry that location's `PostalAddress` on its service-detail page's `LegalService`/`Service` node. `LegalService`/`ProfessionalService` are valid schema.org `LocalBusiness` subtypes, so an offering-level `address` is legitimate schema.org usage, not an extension. The current public renderer inherits the organization visibility setting; it does not expose a separate offering-level visibility control, so a hidden organization address cannot leak through an offering.

## Dashboard/MCP parity

The extended `tenant_compliance` fields (`service_area_type`, `address_visibility`, `founder_name`, `founding_date`, `same_as`, `contact_points`) are edited through the same `upsertProfessionalServiceContent`/`getProfessionalServiceContent` functions used by MCP's `update_professional_service_content`/`get_professional_service_content` tools, plus a new dashboard page (`pages/dashboard/[orgSlug]/sites/[siteSlug]/professional-services.vue`) that calls the same `GET`/`PATCH /api/editor/sites/[siteId]/professional-services` routes MCP/ChowBot already used. No shadow data model or parallel edit path was introduced.

## Considered Options

- Linked per-page `@graph` from one canonical builder (chosen): every route is independently valid and checkable, and dashboard/ChowBot/MCP/import share the exact same read/write functions the builder consumes, so structured data cannot drift from canonical data.
- Single layout-level Organization block referenced by `@id` from separate page scripts: less duplication per page, but couples every route's validity to the layout always rendering first and makes route-level testing/verification harder; not the existing platform convention.
- New `tenant_compliance` address columns duplicating `business_locations`: would avoid a join, but creates two sources of truth for the same address and risks drift between a tenant's location data and its compliance record.
