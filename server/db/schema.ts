import type { SiteSettings, SiteIntegrations } from '../../shared/site-settings'
import { sql } from "drizzle-orm"
import { sqliteTable, integer, text, real, unique, uniqueIndex, index, check, foreignKey, primaryKey } from "drizzle-orm/sqlite-core"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { CONTENT_DOCUMENT_KINDS } from "../../shared/content-registries"
import { NONPROFIT_STATUS_CANONICAL } from "../../utils/professional-service-schema"

export const account = sqliteTable("account", {
	id: text().primaryKey(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: integer({ mode: "timestamp" }),
	refreshTokenExpiresAt: integer({ mode: "timestamp" }),
	scope: text(),
	password: text(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	index("account_userId_idx").on(table.userId),
]);

export const customers = sqliteTable("customers", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	user_id: text().references(() => user.id, { onDelete: "set null" } ),
	stripe_customer_id: text(),
	name: text(),
	email: text(),
	email_normalized: text(),
	email_hash: text(),
	phone: text(),
	phone_normalized: text(),
	phone_metadata_version: text(),
	source: text().notNull(),
	status: text().default("active").notNull(),
	review_request_opted_out_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("customers_instants_check", sql`(review_request_opted_out_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', review_request_opted_out_at, '+0 days') IS review_request_opted_out_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "customers_site_scope_fk" }).onDelete("cascade"),
	uniqueIndex("idx_customers_site_email_normalized_unique").on(table.site_id, table.email_normalized).where(sql`email_normalized IS NOT NULL`),
	uniqueIndex("idx_customers_stripe_customer_id_unique").on(table.stripe_customer_id).where(sql`stripe_customer_id IS NOT NULL`),
	index("idx_customers_site_id").on(table.site_id),
	index("idx_customers_org_site_email_hash").on(table.organization_id, table.site_id, table.email_hash),
	index("idx_customers_user_id").on(table.user_id),
]);

export const business_locations = sqliteTable("business_locations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	slug: text().notNull(),
	title: text().notNull(),
	address: text(),
	city: text(),
	neighborhood: text(),
	phone: text(),
	website_url: text(),
	maps_url: text(),
	latitude: real(),
	longitude: real(),
	opening_hours: text(),
	categories: text(),
	rating: real(),
	review_count: integer(),
	status: text().default("active").notNull(),
	last_synced_at: text(),
	description: text(),
	short_description: text(),
	description_provenance: text(),
	special_hours: text(),
	price_level: text(),
	email: text(),
	facebook_url: text(),
	instagram_url: text(),
	tiktok_url: text(),
	grab_url: text(),
	uber_eats_url: text(),
	foodpanda_url: text(),
	google_place_id: text(),
	google_review_url: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	notification_phone: text(),
	timezone: text(),
	max_capacity: integer(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	// Better Auth Team scoping this location to non-org-wide editors. Site-team membership
	// (sites.team_id below) implies access to all of that site's locations; this location-team
	// membership never implies site-wide access. Owners/admins are org-wide and need no team row.
	// Do not add a parallel membership/scope table — this column plus Better Auth Teams APIs are
	// the entire mechanism.
	team_id: text().references((): AnySQLiteColumn => team.id, { onDelete: "set null" } ),
	feature_overrides: text(),
}, (table) => [
	check("business_locations_instants_check", sql`(last_synced_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', last_synced_at, '+0 days') IS last_synced_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "business_locations_site_scope_fk" }).onDelete("cascade"),
	check("business_locations_address_check", sql`address IS NULL OR (json_valid(address) AND json_type(address) IS 'object')`),
	check("business_locations_categories_check", sql`categories IS NULL OR (json_valid(categories) AND json_type(categories) IS 'array')`),
	check("business_locations_feature_overrides_check", sql`feature_overrides IS NULL OR (json_valid(feature_overrides) AND json_type(feature_overrides) IS 'object')`),
	unique("business_locations_organization_id_site_id_slug_unique").on(table.organization_id, table.site_id, table.slug),
	unique("business_locations_organization_id_site_id_id_unique").on(table.organization_id, table.site_id, table.id),
	// Parent key for the organization-scoped catalog relations (prices,
	// product_locations, availability rules, sessions, inventory levels,
	// reservation configuration) which scope by organization + location without
	// restating the site.
	unique("business_locations_organization_id_id_unique").on(table.organization_id, table.id),
	check("business_locations_opening_hours_check", sql`opening_hours IS NULL OR (json_valid(opening_hours) AND json_type(opening_hours) IS 'object' AND json_type(opening_hours, '$.periods') IS 'array')`),
	check("business_locations_special_hours_check", sql`special_hours IS NULL OR (json_valid(special_hours) AND json_type(special_hours) IS 'array')`),
]);


// The inbox: one conversation thread with a guest, and its workflow state.
// Row meaning: someone contacted this site, and this is the thread.
// Owner/scope: organization + site; location_id routes the thread to a branch.
// This table does NOT own booking truth. It used to carry
//   (product_id, booking_date, time_slot, party_size, status) as an
//   independently writable copy of an occurrence; the occurrence is now a
//   product_sessions row, the seat claim a bookings row, and a table
//   reservation a reservations row. Each links back here through request_id.
//   A contact thread has neither and is not forced into the booking model.
// Null semantics: customer_id NULL is an unmatched guest. review_id NULL means
//   no review was solicited from this thread. location_id NULL means the
//   thread is site-wide.
// Deletion: cascades from site; bookings and reservations survive with
//   request_id set to NULL, because losing an inbox thread must not lose a
//   seat allocation.
// Read/write: server/domain/requests.ts.
export const requests = sqliteTable("requests", {
 id: text().primaryKey(),
 // The inbox thread type. The OPERATIONAL record for a booking or a
 // reservation is the bookings / reservations row that links back here; this
 // column only says which kind of thread the inbox is showing. A contact
 // thread is not a degenerate booking and carries no booking columns.
 kind: text({ enum: ["contact", "booking", "reservation", "work"] }).notNull(),
 organization_id: text().references((): AnySQLiteColumn => organization.id, { onDelete: "cascade" }),
 site_id: text().references((): AnySQLiteColumn => sites.id, { onDelete: "cascade" }),
 location_id: text().references((): AnySQLiteColumn => business_locations.id, { onDelete: "set null" }),
 customer_id: text().references((): AnySQLiteColumn => customers.id, { onDelete: "set null" }),
 review_id: text().references((): AnySQLiteColumn => reviews.id, { onDelete: "set null" }),
 conversation_state: text({ enum: ["needs_attention", "waiting_on_guest", "resolved"] }),
 resolved_at: text(),
 payload_json: text().notNull(),
 created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
 updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, table => [
	check("requests_instants_check", sql`(resolved_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', resolved_at, '+0 days') IS resolved_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
 foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "requests_site_scope_fk" }).onDelete("cascade"),
 foreignKey({ columns: [table.organization_id, table.site_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id], name: "requests_location_scope_fk" }),
 check("requests_payload_check", sql`json_valid(payload_json) AND json_type(payload_json) = 'object'`),
 check("requests_guest_payload_check", sql`(json_type(payload_json, '$.guest.name') IS 'text' AND json_type(payload_json, '$.guest.email') IS 'text' AND (json_type(payload_json, '$.guest.phone') IS 'text' OR json_type(payload_json, '$.guest.phone') IS 'null'))`),
 check("requests_message_payload_check", sql`kind <> 'contact' OR json_type(payload_json, '$.message') IS 'text'`),
 check("requests_scope_check", sql`organization_id IS NOT NULL AND site_id IS NOT NULL`),
 check("requests_state_check", sql`conversation_state IS NOT NULL`),
 uniqueIndex("requests_review_owner_unique").on(table.organization_id, table.site_id, table.id, table.kind),
 uniqueIndex("requests_scope_id_unique").on(table.organization_id, table.site_id, table.id),
 index("requests_site_activity_idx").on(table.site_id, table.conversation_state, table.updated_at),
 index("requests_site_kind_idx").on(table.site_id, table.kind, table.location_id, table.updated_at),
 index("requests_customer_idx").on(table.customer_id),
 index("requests_org_created_idx").on(table.organization_id, table.created_at)
]);



export const activity_entries = sqliteTable("activity_entries", {
 id: text().primaryKey(),
 kind: text({ enum: ["submission", "message", "operation", "assignment", "resolution", "notification", "acknowledgement", "audit"] }).notNull(),
 scope_kind: text({ enum: ["request", "site", "organization", "global"] }).notNull(),
 organization_id: text().references((): AnySQLiteColumn => organization.id, { onDelete: "cascade" }),
 site_id: text().references((): AnySQLiteColumn => sites.id, { onDelete: "cascade" }),
 context_site_id: text().references((): AnySQLiteColumn => sites.id, { onDelete: "set null" }),
 location_id: text().references((): AnySQLiteColumn => business_locations.id, { onDelete: "set null" }),
 request_id: text().references((): AnySQLiteColumn => requests.id, { onDelete: "cascade" }),
 parent_id: text().references((): AnySQLiteColumn => activity_entries.id, { onDelete: "cascade" }),
 actor_kind: text({ enum: ["guest", "member", "system", "cloudflare"] }).notNull(),
 actor_user_id: text().references((): AnySQLiteColumn => user.id, { onDelete: "set null" }),
 target_user_id: text().references((): AnySQLiteColumn => user.id, { onDelete: "set null" }),
 channel: text({ enum: ["web", "email", "whatsapp", "system"] }),
 body: text(),
 event_name: text(),
 payload_json: text().default("{}").notNull(),
 dedupe_key: text().notNull().unique(),
 sequence: integer(),
 occurred_at: text().notNull(),
 created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, table => [
	check("activity_entries_instants_check", sql`(occurred_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at, '+0 days') IS occurred_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
 check("activity_entries_scope_check", sql`(scope_kind = 'request' AND request_id IS NOT NULL AND organization_id IS NULL AND site_id IS NULL AND context_site_id IS NULL AND location_id IS NULL) OR (scope_kind = 'site' AND kind = 'audit' AND site_id IS NOT NULL AND context_site_id IS NULL AND organization_id IS NULL AND request_id IS NULL) OR (scope_kind = 'organization' AND organization_id IS NOT NULL AND site_id IS NULL AND request_id IS NULL) OR (scope_kind = 'global' AND organization_id IS NULL AND site_id IS NULL AND context_site_id IS NULL AND request_id IS NULL)`),
 check("activity_entries_payload_check", sql`json_valid(payload_json) AND json_type(payload_json) = 'object'`),
 check("activity_entries_timeline_check", sql`(kind IN ('submission', 'message', 'operation', 'assignment', 'resolution') AND request_id IS NOT NULL AND sequence IS NOT NULL AND sequence > 0 AND scope_kind = 'request') OR (kind NOT IN ('submission', 'message', 'operation', 'assignment', 'resolution') AND sequence IS NULL)`),
 uniqueIndex("activity_entries_request_sequence_unique").on(table.request_id, table.sequence),
 uniqueIndex("activity_entries_notification_source_unique").on(table.parent_id).where(sql`kind = 'notification' AND parent_id IS NOT NULL`),
 index("activity_entries_request_occurred_idx").on(table.request_id, table.occurred_at),
 index("activity_entries_parent_actor_idx").on(table.parent_id, table.actor_user_id, table.occurred_at),
 index("activity_entries_context_site_created_idx").on(table.kind, table.context_site_id, table.created_at),
 index("activity_entries_site_created_idx").on(table.kind, table.site_id, table.created_at),
 index("activity_entries_org_created_idx").on(table.kind, table.organization_id, table.created_at),
 index("activity_entries_target_created_idx").on(table.kind, table.target_user_id, table.created_at)
]);


export const guest_thread_deliveries = sqliteTable("guest_thread_deliveries", {
	id: text().primaryKey(),
	entry_id: text().notNull().references(() => activity_entries.id, { onDelete: "cascade" } ),
	channel: text().notNull(),
	provider: text().notNull(),
	purpose: text().notNull(),
	status: text().default("pending").notNull(),
	provider_message_id: text(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("guest_thread_deliveries_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	uniqueIndex("guest_thread_deliveries_provider_message_unique").on(table.provider, table.provider_message_id).where(sql`provider_message_id IS NOT NULL`),
	index("guest_thread_deliveries_entry_status_idx").on(table.entry_id, table.status),
	check("guest_thread_deliveries_provider_check", sql`(channel = 'email' AND provider IN ('resend', 'log_only')) OR (channel = 'whatsapp' AND provider IN ('meta', 'log_only'))`),
]);




export const invitation = sqliteTable("invitation", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	role: text(),
	status: text().default("pending").notNull(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	inviterId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	teamId: text().references((): AnySQLiteColumn => team.id, { onDelete: "set null" } ),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	index("invitation_organizationId_idx").on(table.organizationId),
	uniqueIndex("idx_invitation_org_pending_owner").on(table.organizationId).where(sql`role = 'owner' AND status = 'pending'`),
	uniqueIndex("idx_invitation_org_email_pending_unique").on(table.organizationId, sql`lower(${table.email})`).where(sql`status = 'pending'`),
]);

export const jwks = sqliteTable("jwks", {
	id: text().primaryKey(),
	publicKey: text().notNull(),
	privateKey: text().notNull(),
	alg: text(),
	crv: text(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	expiresAt: integer({ mode: "timestamp" }),
});

export const media_assets = sqliteTable("media_assets", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references((): AnySQLiteColumn => sites.id, { onDelete: "cascade" } ),
	kind: text().$type<'image' | 'video' | 'file'>().notNull(),
	provider: text().$type<'cloudflare_images' | 'cloudflare_r2'>().notNull(),
	source: text().$type<'uploaded' | 'generated' | 'external'>().notNull(),
	cloudflare_image_id: text(),
	r2_key: text(),
	public_url: text(),
	// google_media_name intentionally removed 2026-08-27: confirmed zero rows
	// (local + staging) and zero code references before dropping.
	thumbnail_url: text(),
	mime_type: text(),
	file_name: text(),
	file_size: integer(),
	width: integer(),
	height: integer(),
	duration: integer(),
	alt_text: text(),
	generation_key: text(),
	category: text().$type<'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo' | 'blog'>(),
	status: text().$type<'pending' | 'active' | 'deleted' | 'failed'>().default("active").notNull(),
	created_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("media_assets_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "media_assets_site_scope_fk" }).onDelete("cascade"),
	check("media_assets_video_thumbnail_check", sql`kind <> 'video' OR (thumbnail_url IS NOT NULL AND length(trim(thumbnail_url)) > 0)`),
	uniqueIndex("media_assets_org_site_id_unique").on(table.organization_id, table.site_id, table.id),
]);

export const media_placements = sqliteTable("media_placements", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references((): AnySQLiteColumn => sites.id, { onDelete: "cascade" }),
	owner_type: text().notNull(),
	owner_id: text().notNull(),
	slot: text().notNull(),
	asset_id: text().notNull(),
	sort_order: integer().default(0).notNull(),
	status: text().default("active").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("media_placements_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({
		columns: [table.organization_id, table.site_id, table.asset_id],
		foreignColumns: [media_assets.organization_id, media_assets.site_id, media_assets.id],
		name: "media_placements_asset_scope_fk",
	}).onDelete("cascade"),
	check("media_placements_sort_order_check", sql`sort_order >= 0`),
	unique("media_placements_site_owner_slot_asset_unique").on(table.site_id, table.owner_type, table.owner_id, table.slot, table.asset_id),
	unique("media_placements_site_owner_slot_order_unique").on(table.site_id, table.owner_type, table.owner_id, table.slot, table.sort_order),
	index("media_placements_asset_idx").on(table.organization_id, table.site_id, table.asset_id),
]);

export const member = sqliteTable("member", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	role: text().default("member").notNull(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	// Better Auth's organization adapter resolves membership by userId and organizationId.
	index("member_userId_organizationId_idx").on(table.userId, table.organizationId),
	index("member_organizationId_idx").on(table.organizationId),
]);

export const team = sqliteTable("team", {
	id: text().primaryKey(),
	name: text().notNull(),
	memberCount: integer().default(0).notNull(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }),
}, (table) => [
	index("team_organizationId_idx").on(table.organizationId),
]);

export const teamMember = sqliteTable("teamMember", {
	id: text().primaryKey(),
	teamId: text().notNull().references(() => team.id, { onDelete: "cascade" } ),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	membershipKey: text().unique(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	index("teamMember_teamId_idx").on(table.teamId),
	index("teamMember_userId_idx").on(table.userId),
]);

// ---------------------------------------------------------------------------
// Catalog: products, variants, options, prices, publication, collections.
//
// One catalog for every vertical. A restaurant dish, a pottery class, and a
// consultation are all Products; nothing about their storage differs. There is
// no `product_type` discriminator, because a discriminator that selects a
// schema is how five verticals became five half-models. Capabilities compose
// instead: a Product gains booking by having a product_booking_configs row,
// stock by having an inventory_items row, a page by being referenced from a
// content_documents root. Absence of a capability row is the absence of the
// capability, never a NULL to be interpreted.
//
// Value sets (price `type`, session/booking `status`, metafield `value_type`)
// are NOT encoded as CHECK constraints. D1 enforces foreign keys on every
// statement and cannot alter a CHECK in place, so a closed value set on a
// referenced parent makes adding one value an impossible table rebuild. Value
// sets live in the registries under `shared/` and `utils/` and are enforced by
// the validators there. Every CHECK below is structural: JSON shape, canonical
// instants, or a cross-column rule.
// ---------------------------------------------------------------------------

// A Product is catalog identity, owned by the organization and nothing else.
// Row meaning: one thing a merchant sells, once, however many sites publish it
//   or locations offer it. Another location or another site does not create
//   another Product.
// Owner/scope: organization. Deliberately NOT site, location, or category —
//   those are relationships (product_publications, product_locations,
//   collection_products), because a shared catalog is the point.
// Keys: id; (organization_id, id) for children; (organization_id, slug) so a
//   slug identifies one Product per tenant.
// Null semantics: order_url NULL means no ordering destination is configured,
//   never "use the site's". unit_label NULL means amounts are per unsuffixed
//   unit. tax_code NULL means no declared code, not a default one.
// Deletion: cascades to variants, options, publication/location rows,
//   collection membership, metafield values, booking config, rules and
//   sessions. A canonical page pointing at the product REFUSES the delete
//   (content_documents_product_scope_fk is RESTRICT), and so does a booking:
//   the domain checks both and says which, because the cascade would otherwise
//   take seat allocations with it.
// Read/write: server/utils/product-management.ts (writes),
//   server/utils/product-validation.ts (validators),
//   server/utils/public-products.ts (public reads).
export const products = sqliteTable("products", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	name: text().notNull(),
	slug: text().notNull(),
	description: text().default("").notNull(),
	// Merchant sale-enable control. Not visibility, not stock, not a counter.
	// Site visibility is product_publications.published; location visibility is
	// product_locations.published; stock is inventory_levels; seats are
	// product_sessions.capacity. A product with active = 0 is not sold out.
	active: integer({ mode: "boolean" }).default(true).notNull(),
	// Narrow ordering destination (a delivery partner, a booking host). NOT the
	// public product page: that is resolved from an explicit publication/site
	// context. Stripe's Product `url` is the page, not this.
	order_url: text(),
	// Stripe Product `unit_label`: a unit noun such as 'person' or 'night'.
	// Pricing prose is block content, never this column.
	unit_label: text(),
	// Stripe Product `marketing_features`: generic selling bullets. Not a merge
	// of inclusions, preparation instructions, policies and features — those are
	// separate metafield definitions.
	marketing_features: text().default("[]").notNull(),
	// Validated tag list with the domain/rendering behavior the old `tags_json`
	// carried. A tag is not metadata and not a collection.
	tags: text().default("[]").notNull(),
	// Validated string-to-string annotation/integration escape hatch. The object
	// shape is enforced here; string-valued entries are enforced by the shared
	// validator, since a CHECK cannot iterate JSON. No pricing, scheduling,
	// stock, permission, routing or filtering behavior may read this.
	metadata: text().default("{}").notNull(),
	tax_code: text(),
	// Provenance of the row, retained with an explicit owner.
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("products_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	unique("products_org_id_unique").on(table.organization_id, table.id),
	unique("products_org_slug_unique").on(table.organization_id, table.slug),
	check("products_name_not_blank_check", sql`trim(name) <> ''`),
	check("products_slug_check", sql`slug <> '' AND slug = lower(slug) AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT LIKE '-%' AND slug NOT LIKE '%-' AND slug NOT LIKE '%--%'`),
	check("products_active_check", sql`active IN (0, 1)`),
	check("products_marketing_features_check", sql`json_valid(marketing_features) AND json_type(marketing_features) = 'array'`),
	check("products_tags_check", sql`json_valid(tags) AND json_type(tags) = 'array'`),
	check("products_metadata_check", sql`json_valid(metadata) AND json_type(metadata) = 'object'`),
	check("products_order_url_check", sql`order_url IS NULL OR (order_url LIKE 'https://_%' AND instr(order_url, '@') = 0 AND instr(order_url, char(10)) = 0 AND instr(order_url, char(13)) = 0)`),
]);

// The purchasable unit. Every Product has at least one — a Product with no
// customer-selectable options has one real default variant, not a special
// product-only purchase path. "At least one" is an application invariant with
// real-boundary coverage: SQL cannot express it without making inserts
// circular.
// Row meaning: one buyable configuration of a Product.
// Owner/scope: organization, through product_id.
// Keys: id; (organization_id, id) for prices/inventory/bookings;
//   (organization_id, product_id, id) so option selections can prove
//   same-product membership.
// Null semantics: sku NULL means unstocked/untracked identity, not empty.
// Deletion: cascades to prices, option-value selections, inventory items.
//   Deleting the last variant of a Product is refused by the domain layer.
// Do NOT create a variant for a currency, a location, a price revision, or
// another scheduled class date. Those are prices, product_locations, price
// validity periods and product_sessions respectively.
// Read/write: server/utils/product-management.ts.
export const product_variants = sqliteTable("product_variants", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	name: text().notNull(),
	sku: text(),
	active: integer({ mode: "boolean" }).default(true).notNull(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("product_variants_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_variants_product_scope_fk" }).onDelete("cascade"),
	unique("product_variants_org_id_unique").on(table.organization_id, table.id),
	unique("product_variants_product_id_unique").on(table.organization_id, table.product_id, table.id),
	uniqueIndex("product_variants_org_sku_unique").on(table.organization_id, table.sku).where(sql`sku IS NOT NULL`),
	index("product_variants_product_sort_idx").on(table.product_id, table.sort_order),
	check("product_variants_name_not_blank_check", sql`trim(name) <> ''`),
	check("product_variants_active_check", sql`active IN (0, 1)`),
	check("product_variants_sort_order_check", sql`sort_order >= 0`),
]);

// A selectable dimension of a Product ("Size", "Noodle"). Options and their
// values are Product-owned so a variant's selections can be proved to belong
// to the same Product in SQL rather than in a validator's memory.
// Keys: (organization_id, product_id, id) is the parent key every selection
//   row matches on.
// Deletion: cascades to values and to the selections referencing them.
// Read/write: server/utils/product-management.ts.
export const product_options = sqliteTable("product_options", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	name: text().notNull(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("product_options_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_options_product_scope_fk" }).onDelete("cascade"),
	unique("product_options_product_id_unique").on(table.organization_id, table.product_id, table.id),
	unique("product_options_product_name_unique").on(table.organization_id, table.product_id, table.name),
	index("product_options_product_sort_idx").on(table.product_id, table.sort_order),
	check("product_options_name_not_blank_check", sql`trim(name) <> ''`),
	check("product_options_sort_order_check", sql`sort_order >= 0`),
]);

// One allowed value of one option. `product_id` is carried so the selection
// table can match option, value and variant against a single Product key.
// Keys: (organization_id, product_id, product_option_id, id).
// Read/write: server/utils/product-management.ts.
export const product_option_values = sqliteTable("product_option_values", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	product_option_id: text().notNull(),
	value: text().notNull(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("product_option_values_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_option_id], foreignColumns: [product_options.organization_id, product_options.product_id, product_options.id], name: "product_option_values_option_scope_fk" }).onDelete("cascade"),
	unique("product_option_values_option_id_unique").on(table.organization_id, table.product_id, table.product_option_id, table.id),
	unique("product_option_values_option_value_unique").on(table.organization_id, table.product_option_id, table.value),
	index("product_option_values_option_sort_idx").on(table.product_option_id, table.sort_order),
	check("product_option_values_value_not_blank_check", sql`trim(value) <> ''`),
	check("product_option_values_sort_order_check", sql`sort_order >= 0`),
]);

// Which option value each variant selects.
// Row meaning: variant X answers option Y with value Z.
// Enforced in SQL: value, option and variant all belong to the same Product
//   (every foreign key below matches on product_id), and a variant selects at
//   most ONE value per option (the composite primary key).
// Enforced by the domain layer, with real-boundary coverage: required
//   selections are complete, and two variants of one Product cannot select the
//   same combination. Neither is expressible as a SQLite constraint.
// Read/write: server/utils/product-management.ts.
export const product_variant_option_values = sqliteTable("product_variant_option_values", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	product_variant_id: text().notNull(),
	product_option_id: text().notNull(),
	product_option_value_id: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.product_variant_id, table.product_option_id], name: "product_variant_option_values_pk" }),
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_variant_id], foreignColumns: [product_variants.organization_id, product_variants.product_id, product_variants.id], name: "product_variant_option_values_variant_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_option_id], foreignColumns: [product_options.organization_id, product_options.product_id, product_options.id], name: "product_variant_option_values_option_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_option_id, table.product_option_value_id], foreignColumns: [product_option_values.organization_id, product_option_values.product_id, product_option_values.product_option_id, product_option_values.id], name: "product_variant_option_values_value_scope_fk" }).onDelete("cascade"),
	index("product_variant_option_values_variant_idx").on(table.product_variant_id),
]);

// A monetary offer on one variant.
// Row meaning: this variant costs this much, in this currency, under these
//   billing terms, optionally only at this location, optionally only during
//   this period.
// Owner/scope: organization, through the variant. There is NO product_id
//   column: the Product is resolved through product_variant_id. Two writable
//   parents that can disagree is the defect this replaces.
// Null semantics: location_id NULL is a DECLARED location-neutral scope, not a
//   missing association and not a wildcard to fall back to. valid_from_at NULL
//   means "since always"; valid_until_at NULL means "until further notice".
//   compare_at_unit_amount NULL means no strike-through. A variant with no
//   price row is not free — it is not purchasable, and the surface says so.
//   unit_amount = 0 is an explicit free offer.
// Deletion: cascades from the variant. Historical purchase amounts are
//   snapshots elsewhere and are never rewritten by editing a price.
// Read/write: shared/prices.ts owns the one deterministic selection contract
//   over (variant, currency, location, effective instant, billing terms). It
//   REFUSES an ambiguous selection rather than ordering rows and taking the
//   first. No caller re-implements precedence.
export const prices = sqliteTable("prices", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_variant_id: text().notNull(),
	location_id: text(),
	active: integer({ mode: "boolean" }).default(true).notNull(),
	// Normalized ISO 4217 code, uppercase.
	currency: text().notNull(),
	// Integer amount in the currency's smallest unit. Never floating point.
	unit_amount: integer().notNull(),
	// Billing recurrence: 'one_time' | 'recurring' (shared/prices.ts). This is
	// BILLING, not class dates. A weekly class is product_availability_rules,
	// never a weekly recurring price.
	type: text().$type<'one_time' | 'recurring'>().default("one_time").notNull(),
	recurring_interval: text().$type<'day' | 'week' | 'month' | 'year'>(),
	recurring_interval_count: integer(),
	tax_behavior: text().$type<'unspecified' | 'inclusive' | 'exclusive'>().default("unspecified").notNull(),
	compare_at_unit_amount: integer(),
	valid_from_at: text(),
	valid_until_at: text(),
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("prices_instants_check", sql`(valid_from_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', valid_from_at, '+0 days') IS valid_from_at) AND (valid_until_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', valid_until_at, '+0 days') IS valid_until_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_variant_id], foreignColumns: [product_variants.organization_id, product_variants.id], name: "prices_variant_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "prices_location_scope_fk" }).onDelete("cascade"),
	index("prices_variant_validity_idx").on(table.organization_id, table.product_variant_id, table.active, table.valid_from_at, table.valid_until_at),
	index("prices_location_idx").on(table.organization_id, table.location_id),
	check("prices_active_check", sql`active IN (0, 1)`),
	check("prices_currency_check", sql`length(currency) = 3 AND currency = upper(currency) AND currency NOT GLOB '*[^A-Z]*'`),
	check("prices_unit_amount_check", sql`unit_amount >= 0`),
	check("prices_compare_at_check", sql`compare_at_unit_amount IS NULL OR compare_at_unit_amount > unit_amount`),
	check("prices_validity_check", sql`valid_until_at IS NULL OR valid_from_at IS NULL OR valid_until_at > valid_from_at`),
	// Cross-column rule, not a value set: recurrence fields exist exactly when
	// the price recurs. An unsupported billing mode is rejected by the
	// validator in shared/prices.ts, loudly.
	check("prices_recurring_check", sql`(type = 'recurring' AND recurring_interval IS NOT NULL AND recurring_interval_count IS NOT NULL AND recurring_interval_count > 0) OR (type <> 'recurring' AND recurring_interval IS NULL AND recurring_interval_count IS NULL)`),
]);

// Which sites publish a Product.
// Row meaning: this site carries this Product in its catalog, published or not.
// Site publication is independent of products.active and of
//   product_locations.published. All three are distinct, separately tested
//   states; none implies another.
// Null semantics: no row means the site does not carry the Product at all —
//   distinct from a row with published = 0, which means "carried, withheld".
// Deletion: cascades from Product and from site.
// Read/write: server/utils/product-management.ts;
//   server/utils/public-products.ts for site projections. A publication change
//   enqueues public_resource_cache_invalidations for every affected site, so a
//   Product in several documents cannot leave independently stale copies.
export const product_publications = sqliteTable("product_publications", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	site_id: text().notNull(),
	published: integer({ mode: "boolean" }).default(false).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.product_id, table.site_id], name: "product_publications_pk" }),
	check("product_publications_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_publications_product_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "product_publications_site_scope_fk" }).onDelete("cascade"),
	index("product_publications_site_idx").on(table.site_id, table.published),
	check("product_publications_published_check", sql`published IN (0, 1)`),
]);

// Where a Product is offered.
// Row meaning: this location offers this Product. Membership exists
//   independently of prices and of stock — a price does not establish where a
//   Product is sold, and a location with no price row still offers it (at a
//   location-neutral price, or not purchasably, which the surface states).
// `active` enables sale at that location; `published` includes it on that
//   location's surfaces. Both are independent of products.active and of site
//   publication.
// Authorization: a location-scoped editor may write THIS row and that
//   location's prices, sessions and reservation configuration. It does not
//   grant them edit rights on the organization-wide Product or on another
//   location's rows — enforced by server/utils/organization-access.ts, not by
//   this table.
// Deletion: cascades from Product and from location.
// Read/write: server/utils/product-management.ts.
export const product_locations = sqliteTable("product_locations", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	location_id: text().notNull(),
	active: integer({ mode: "boolean" }).default(true).notNull(),
	published: integer({ mode: "boolean" }).default(false).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.product_id, table.location_id], name: "product_locations_pk" }),
	check("product_locations_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_locations_product_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "product_locations_location_scope_fk" }).onDelete("cascade"),
	index("product_locations_location_idx").on(table.location_id, table.published, table.active),
	check("product_locations_active_check", sql`active IN (0, 1) AND published IN (0, 1)`),
]);

// Merchant merchandising: a named, ordered grouping a site presents.
// This replaces `product_categories` and the `featured` / `featured_sort_order`
// columns. A curated "Featured" grouping is a Collection whose membership is
// explicit; there is no second featured-product truth on products. This is
// merchandising, not a taxonomy — no unused classification system is
// introduced to preserve the old table's name.
// Row meaning: one grouping on one site, optionally narrowed to one location
//   (a menu section that exists only at one branch).
// Null semantics: location_id NULL means the grouping applies site-wide.
// Deletion: cascades from site and location; cascades to membership. Deleting
//   a Collection never deletes its Products.
// Read/write: server/utils/product-management.ts;
//   server/utils/public-products.ts.
export const collections = sqliteTable("collections", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull(),
	location_id: text(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("collections_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "collections_site_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id], name: "collections_location_scope_fk" }).onDelete("cascade"),
	unique("collections_org_id_unique").on(table.organization_id, table.id),
	uniqueIndex("collections_site_slug_unique").on(table.site_id, table.slug).where(sql`location_id IS NULL`),
	uniqueIndex("collections_location_slug_unique").on(table.site_id, table.location_id, table.slug).where(sql`location_id IS NOT NULL`),
	index("collections_site_sort_idx").on(table.site_id, table.location_id, table.sort_order),
	check("collections_name_not_blank_check", sql`trim(name) <> ''`),
	check("collections_slug_check", sql`slug <> '' AND slug = lower(slug) AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT LIKE '-%' AND slug NOT LIKE '%-' AND slug NOT LIKE '%--%'`),
	check("collections_sort_order_check", sql`sort_order >= 0`),
]);

// Collection membership, and the position of a Product WITHIN that collection.
// Position lives here, not on products: the same Product can sit third on one
// site's menu and first in another location's grouping without being copied.
// Deletion: cascades from Collection and from Product.
// Read/write: server/utils/product-management.ts.
export const collection_products = sqliteTable("collection_products", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	collection_id: text().notNull(),
	product_id: text().notNull(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.collection_id, table.product_id], name: "collection_products_pk" }),
	check("collection_products_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.collection_id], foreignColumns: [collections.organization_id, collections.id], name: "collection_products_collection_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "collection_products_product_scope_fk" }).onDelete("cascade"),
	// Ordering is (sort_order, product_id) — fully deterministic without a
	// uniqueness constraint, which would turn every menu reorder into a
	// two-phase update over hundreds of rows.
	index("collection_products_order_idx").on(table.collection_id, table.sort_order, table.product_id),
	index("collection_products_product_idx").on(table.product_id),
	check("collection_products_sort_order_check", sql`sort_order >= 0`),
]);

// ---------------------------------------------------------------------------
// Typed descriptive extensions.
//
// This replaces `products.details_json` and the descriptive half of
// `experience_json`. A definition names an attribute and states its type and
// constraints once, for the tenant; a value row supplies one Product's answer.
// That is the whole extension mechanism: adding an eleventh attribute of a
// supported type is one definition row — no column, no field-specific handler,
// no localization-registry entry, no rendering branch.
//
// This is deliberately NOT a universal `owner_type + owner_id + payload`
// store. It carries reusable descriptive product attributes and nothing else.
// Operational identities, money, capacity allocations and independently
// referenced records have their own relations below. Page-only prose is block
// content.
// ---------------------------------------------------------------------------

// Row meaning: one attribute this tenant's Products may carry.
// Owner/scope: organization. Namespaced so an imported vocabulary cannot
//   collide with a merchant's own.
// `value_type` names a supported type from the registry in shared/ (scalar and
//   list forms). `validations` is the typed constraint object for that type.
//   Neither is a CHECK here: a closed set on a referenced parent cannot be
//   altered in D1.
// `localizable` is the definition's declaration of localization eligibility.
//   The localization machinery reads THIS, rather than keeping its own
//   hardcoded list of attribute names.
// Null semantics: validations '{}' means "the type's own rules only".
// Deletion: cascades to every product value of that definition. Deleting a
//   definition is a deliberate vocabulary change, not a cleanup.
// Read/write: server/utils/product-validation.ts owns definition and value
//   validation for every caller — imports, CMS, MCP, onboarding.
export const metafield_definitions = sqliteTable("metafield_definitions", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	namespace: text().notNull(),
	key: text().notNull(),
	name: text().notNull(),
	description: text(),
	value_type: text().notNull(),
	validations: text().default("{}").notNull(),
	localizable: integer({ mode: "boolean" }).default(false).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("metafield_definitions_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	unique("metafield_definitions_org_id_unique").on(table.organization_id, table.id),
	unique("metafield_definitions_namespace_key_unique").on(table.organization_id, table.namespace, table.key),
	check("metafield_definitions_namespace_check", sql`namespace <> '' AND namespace = lower(namespace) AND namespace NOT GLOB '*[^a-z0-9_-]*'`),
	check("metafield_definitions_key_check", sql`key <> '' AND key = lower(key) AND key NOT GLOB '*[^a-z0-9_-]*'`),
	check("metafield_definitions_name_not_blank_check", sql`trim(name) <> ''`),
	check("metafield_definitions_validations_check", sql`json_valid(validations) AND json_type(validations) = 'object'`),
	check("metafield_definitions_localizable_check", sql`localizable IN (0, 1)`),
]);

// Row meaning: this Product's value for this definition.
// Enforced in SQL: one value per (product, definition), and the Product and
//   the definition belong to the same organization.
// Enforced by server/utils/product-validation.ts: the value conforms to the
//   definition's value_type and validations. A typed list is stored as a JSON
//   array; the shape is structural here, the element type is the validator's.
// Null semantics: no row means the Product does not carry the attribute.
//   There is no per-definition default that a missing row falls back to.
// Deletion: cascades from Product and from definition.
// Localized values live in resource_localizations under the product resource
//   type, gated by metafield_definitions.localizable.
export const product_metafields = sqliteTable("product_metafields", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	definition_id: text().notNull(),
	value: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.product_id, table.definition_id], name: "product_metafields_pk" }),
	check("product_metafields_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_metafields_product_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.definition_id], foreignColumns: [metafield_definitions.organization_id, metafield_definitions.id], name: "product_metafields_definition_scope_fk" }).onDelete("cascade"),
	index("product_metafields_definition_idx").on(table.definition_id),
	check("product_metafields_value_check", sql`json_valid(value)`),
]);

// ---------------------------------------------------------------------------
// Booking capability: configuration, recurrence rules, concrete sessions.
//
// This replaces `products.experience_json` and the tuple-keyed booking columns
// on `requests`. The chain is deliberate and one-directional: a config row
// says the Product is bookable; rules describe when sessions should exist;
// sessions ARE the occurrences and own their own time, capacity and state; a
// booking claims seats on one session. Nothing infers a step from the absence
// of another.
// ---------------------------------------------------------------------------

// The existence of this row is what makes a Product bookable. Not a non-null
// duration, not a vertical name, not a product_type discriminator.
// Row meaning: this Product takes bookings, with these defaults.
// Keys: product_id is the primary key — one config per Product.
// Null semantics: duration_minutes NULL means each rule or session states its
//   own length. default_capacity NULL means unlimited unless a rule or session
//   states a number — which is different from default_capacity = 0, meaning
//   bookable in principle but currently seatless.
// Deletion: cascades from Product; cascades to rules and sessions, and through
//   sessions to bookings. Removing booking capability is explicit and
//   destructive by design, never a side effect of editing a page.
// Read/write: server/utils/availability.ts.
export const product_booking_configs = sqliteTable("product_booking_configs", {
	product_id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	duration_minutes: integer(),
	default_capacity: integer(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("product_booking_configs_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "product_booking_configs_product_scope_fk" }).onDelete("cascade"),
	// Parent key for rules and sessions: they scope by (organization, product)
	// so a rule can never attach to another tenant's Product.
	unique("product_booking_configs_org_product_unique").on(table.organization_id, table.product_id),
	check("product_booking_configs_duration_check", sql`duration_minutes IS NULL OR duration_minutes > 0`),
	check("product_booking_configs_capacity_check", sql`default_capacity IS NULL OR default_capacity >= 0`),
]);

// Typed weekly recurrence. This replaces the `recurring_slots` JSON map; it is
// not that map relocated into another ungoverned column.
// Row meaning: sessions of this Product should exist on this weekday at this
//   local start time, every `interval_weeks` weeks, within the effective dates.
// Recurrence is defined in LOCAL WALL TIME plus an IANA timezone — an offset
//   alone is not a recurrence timezone, because offsets move and wall clocks
//   do not. Session instants are stored in UTC. Nonexistent and ambiguous
//   local times (spring-forward gaps, fall-back repeats) have defined
//   behavior in server/utils/availability.ts with real coverage.
// Null semantics: location_id NULL means the rule is not location-specific.
//   duration_minutes / capacity NULL defer to product_booking_configs.
//   effective_from_date / effective_until_date NULL mean open-ended.
// Deletion: cascades from Product and location. Sessions already generated
//   keep their own times and capacity — deleting a rule does not delete or
//   move them, and editing one does not silently reschedule existing bookings.
//   Series edits are explicit, scoped operations in the domain layer.
// Read/write: server/utils/availability.ts.
export const product_availability_rules = sqliteTable("product_availability_rules", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	location_id: text(),
	// IANA zone name, e.g. 'Asia/Bangkok'.
	timezone: text().notNull(),
	// 0 = Sunday .. 6 = Saturday.
	weekday: integer().notNull(),
	// Local wall-clock 'HH:MM'.
	start_time: text().notNull(),
	interval_weeks: integer().default(1).notNull(),
	effective_from_date: text(),
	effective_until_date: text(),
	duration_minutes: integer(),
	capacity: integer(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("product_availability_rules_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [product_booking_configs.organization_id, product_booking_configs.product_id], name: "product_availability_rules_config_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "product_availability_rules_location_scope_fk" }).onDelete("cascade"),
	unique("product_availability_rules_org_id_unique").on(table.organization_id, table.id),
	// SQLite UNIQUE treats NULLs as distinct, so a single key over the nullable
	// location_id would let a location-neutral rule be inserted repeatedly —
	// the common case. Two partial indexes instead, one per location state.
	// effective_from_date is deliberately NOT part of the key: two rules for the
	// same weekday and time differing only by effective window are an ambiguity
	// about which one governs, not two distinct slots.
	uniqueIndex("product_availability_rules_slot_unique").on(table.product_id, table.location_id, table.weekday, table.start_time, table.interval_weeks).where(sql`location_id IS NOT NULL`),
	uniqueIndex("product_availability_rules_neutral_slot_unique").on(table.product_id, table.weekday, table.start_time, table.interval_weeks).where(sql`location_id IS NULL`),
	index("product_availability_rules_product_idx").on(table.product_id, table.weekday, table.start_time),
	check("product_availability_rules_weekday_check", sql`weekday BETWEEN 0 AND 6`),
	check("product_availability_rules_start_time_check", sql`start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time < '24:00'`),
	check("product_availability_rules_interval_check", sql`interval_weeks >= 1`),
	// A cadence longer than a week has to say from when, or "every other
	// Saturday" means a different Saturday depending on the day generation
	// happens to run. The anchor is the rule's own effective start.
	check("product_availability_rules_anchor_check", sql`interval_weeks = 1 OR effective_from_date IS NOT NULL`),
	check("product_availability_rules_dates_check", sql`(effective_from_date IS NULL OR date(effective_from_date, '+0 days') IS effective_from_date) AND (effective_until_date IS NULL OR date(effective_until_date, '+0 days') IS effective_until_date) AND (effective_from_date IS NULL OR effective_until_date IS NULL OR effective_until_date >= effective_from_date)`),
	check("product_availability_rules_duration_check", sql`duration_minutes IS NULL OR duration_minutes > 0`),
	check("product_availability_rules_capacity_check", sql`capacity IS NULL OR capacity >= 0`),
	check("product_availability_rules_timezone_check", sql`timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*'`),
]);

// A concrete occurrence. Sessions own actual times, capacity and state — the
// rule that generated one is provenance, not authority.
// Row meaning: this Product runs at this instant, seating this many.
// Null semantics: availability_rule_id NULL is a legitimate one-off session,
//   not an orphan. location_id NULL means the session is not location-bound.
//   capacity NULL means unlimited; capacity = 0 means no seats. These are
//   different and both are tested.
// `source_occurrence_key` is the stable generation identity (rule + intended
//   local occurrence), NOT the mutable start time. It is what makes
//   materialization idempotent: re-running generation cannot duplicate a
//   session, resurrect a cancelled one, overwrite an edited one, or recreate a
//   rescheduled one under its old start. NULL for one-off sessions.
// Deletion: cascades from Product; cascades to bookings. Cancelling is a
//   status change, not a delete — a deleted session loses its booking history.
// Read/write: server/utils/availability.ts owns generation and the single
//   protected capacity-allocation operation. Session identity alone is not the
//   concurrency control; that operation is.
export const product_sessions = sqliteTable("product_sessions", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_id: text().notNull(),
	location_id: text(),
	availability_rule_id: text(),
	source_occurrence_key: text(),
	timezone: text().notNull(),
	starts_at: text().notNull(),
	ends_at: text().notNull(),
	capacity: integer(),
	// 'scheduled' | 'cancelled' | 'completed' (registry in shared/). Which
	// statuses consume capacity is declared there, not inferred here.
	status: text().default("scheduled").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("product_sessions_instants_check", sql`(strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+0 days') IS starts_at) AND (strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+0 days') IS ends_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [product_booking_configs.organization_id, product_booking_configs.product_id], name: "product_sessions_config_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "product_sessions_location_scope_fk" }).onDelete("cascade"),
	// RESTRICT for the same composite-SET-NULL reason as above. Deleting a rule
	// must not delete or move the sessions it generated, so the domain operation
	// clears availability_rule_id on those sessions first — dropping provenance
	// deliberately — and only then deletes the rule.
	foreignKey({ columns: [table.organization_id, table.availability_rule_id], foreignColumns: [product_availability_rules.organization_id, product_availability_rules.id], name: "product_sessions_rule_scope_fk" }).onDelete("restrict"),
	unique("product_sessions_org_id_unique").on(table.organization_id, table.id),
	// Parent key for bookings: a booking matches on product_id too, so a ticket
	// variant from another Product cannot be booked onto this session.
	unique("product_sessions_org_product_id_unique").on(table.organization_id, table.product_id, table.id),
	// Idempotent materialization: one session per generated occurrence.
	uniqueIndex("product_sessions_occurrence_unique").on(table.product_id, table.source_occurrence_key).where(sql`source_occurrence_key IS NOT NULL`),
	// One session per product, location and instant. Ticket tiers are variants
	// sharing this session, never a session each. Partial indexes again, because
	// location_id is nullable and NULLs are distinct under UNIQUE.
	uniqueIndex("product_sessions_location_instant_unique").on(table.product_id, table.location_id, table.starts_at).where(sql`location_id IS NOT NULL`),
	uniqueIndex("product_sessions_neutral_instant_unique").on(table.product_id, table.starts_at).where(sql`location_id IS NULL`),
	index("product_sessions_product_start_idx").on(table.product_id, table.starts_at, table.status),
	index("product_sessions_location_start_idx").on(table.location_id, table.starts_at, table.status),
	check("product_sessions_interval_check", sql`ends_at > starts_at`),
	check("product_sessions_capacity_check", sql`capacity IS NULL OR capacity >= 0`),
	check("product_sessions_timezone_check", sql`timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*'`),
]);

// A claim on seats of one session.
// Row meaning: this party holds this many seats on this session, in this
//   variant, in this state.
// Enforced in SQL: the variant belongs to the session's Product (the composite
//   foreign key matches on product_id), so a ticket type from another class
//   cannot be booked onto this one. party_size is positive.
// Ticket variants SHARE the session's capacity — each price does not create
//   its own seat pool. Capacity is claimed through the one protected operation
//   in server/utils/availability.ts, which declares which statuses consume
//   capacity, how cancellation releases it, how a pending hold expires, and
//   the idempotency key. Concurrent claims cannot exceed capacity; that is a
//   tested property, not an assumption about row locking.
// Null semantics: customer_id NULL is a guest booking with contact details on
//   the linked request. request_id NULL is a booking made without an inbox
//   thread (dashboard, MCP) — the booking is still the operational truth.
// Deletion: cascades from session; customer_id becomes NULL if the customer
//   record goes. An inbox thread cannot be deleted while a booking links to
//   it, so a seat record can never be lost by tidying the inbox.
// A confirmed booking is NOT a successful payment. Money is not represented
//   here, and no column may be widened to represent it.
export const bookings = sqliteTable("bookings", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull(),
	product_id: text().notNull(),
	product_session_id: text().notNull(),
	product_variant_id: text().notNull(),
	customer_id: text().references((): AnySQLiteColumn => customers.id, { onDelete: "set null" }),
	request_id: text(),
	party_size: integer().notNull(),
	// 'pending' | 'confirmed' | 'cancelled' | 'completed' (registry in shared/).
	status: text().default("pending").notNull(),
	// Hold expiry for a pending claim. NULL means the claim does not expire.
	hold_expires_at: text(),
	cancelled_at: text(),
	completed_at: text(),
	cancellation_reason: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("bookings_instants_check", sql`(hold_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', hold_expires_at, '+0 days') IS hold_expires_at) AND (cancelled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at, '+0 days') IS cancelled_at) AND (completed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', completed_at, '+0 days') IS completed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "bookings_site_scope_fk" }).onDelete("cascade"),
	// A booking pins what it holds. Deleting the session or the variant it
	// names is refused while the booking exists — a guest's seat is not
	// something an edit, a capability change or a product deletion may erase as
	// a side effect. The domain checks first so the merchant reads a sentence
	// instead of a constraint name; this is what makes the check true under a
	// booking that arrives between the check and the write.
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_session_id], foreignColumns: [product_sessions.organization_id, product_sessions.product_id, product_sessions.id], name: "bookings_session_scope_fk" }).onDelete("restrict"),
	foreignKey({ columns: [table.organization_id, table.product_id, table.product_variant_id], foreignColumns: [product_variants.organization_id, product_variants.product_id, product_variants.id], name: "bookings_variant_scope_fk" }).onDelete("restrict"),
	// RESTRICT for the same composite-SET-NULL reason. Deleting an inbox thread
	// must not delete a seat allocation, so the domain operation unlinks the
	// booking first. Losing the whole site cascades both away together.
	foreignKey({ columns: [table.organization_id, table.site_id, table.request_id], foreignColumns: [requests.organization_id, requests.site_id, requests.id], name: "bookings_request_scope_fk" }).onDelete("restrict"),
	uniqueIndex("bookings_request_unique").on(table.request_id).where(sql`request_id IS NOT NULL`),
	index("bookings_session_status_idx").on(table.product_session_id, table.status),
	index("bookings_site_created_idx").on(table.site_id, table.created_at),
	index("bookings_customer_idx").on(table.customer_id),
	index("bookings_hold_expiry_idx").on(table.hold_expires_at).where(sql`hold_expires_at IS NOT NULL`),
	check("bookings_party_size_check", sql`party_size > 0`),
]);

// ---------------------------------------------------------------------------
// Location reservations.
//
// A restaurant table reservation is not a product session and the restaurant
// is not selling a catalog item by taking it. This capability is location-owned
// and stays that way; it replaces `business_locations.booking_json` with typed
// columns and is NOT a second experience-booking implementation wearing the
// reservation name.
//
// Opening hours and special hours remain on business_locations as the declared
// hours source. They are not copied into a product schedule.
// ---------------------------------------------------------------------------

// Reservation policy for one location, typed. This replaces the eleven keys
// that lived under booking_json.$.reservation.policy.
// Row meaning: this location takes reservations, under this policy. The
//   existence of the row is the capability; there is no enabled flag and no
//   operational JSON reader.
// Capacity contract: capacity is per START-TIME SLOT, not per overlapping
//   interval. That choice is preserved consistently by
//   server/utils/reservations.ts and is not re-decided per caller.
// Null semantics: every policy field NULL means the policy does not constrain
//   that dimension — not that a platform default applies.
// Deletion: cascades from location; cascades to overrides. Reservations keep
//   their own records.
// Read/write: server/utils/reservations.ts.
export const location_reservation_configs = sqliteTable("location_reservation_configs", {
	location_id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	slot_capacity: integer(),
	advance_notice_minutes: integer(),
	minimum_guest_age: integer(),
	deposit_required: integer({ mode: "boolean" }).default(false).notNull(),
	deposit_trigger_party_size: integer(),
	free_cancellation_until_minutes: integer(),
	reschedule_allowed: integer({ mode: "boolean" }).default(true).notNull(),
	reschedule_cutoff_minutes: integer(),
	accessibility_contact_required: integer({ mode: "boolean" }).default(false).notNull(),
	additional_notes_html: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("location_reservation_configs_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "location_reservation_configs_location_scope_fk" }).onDelete("cascade"),
	// Parent key for overrides.
	unique("location_reservation_configs_org_location_unique").on(table.organization_id, table.location_id),
	check("location_reservation_configs_booleans_check", sql`deposit_required IN (0, 1) AND reschedule_allowed IN (0, 1) AND accessibility_contact_required IN (0, 1)`),
	check("location_reservation_configs_slot_capacity_check", sql`slot_capacity IS NULL OR slot_capacity >= 0`),
	check("location_reservation_configs_minutes_check", sql`(advance_notice_minutes IS NULL OR advance_notice_minutes >= 0) AND (free_cancellation_until_minutes IS NULL OR free_cancellation_until_minutes >= 0) AND (reschedule_cutoff_minutes IS NULL OR reschedule_cutoff_minutes >= 0)`),
	check("location_reservation_configs_party_check", sql`deposit_trigger_party_size IS NULL OR deposit_trigger_party_size > 0`),
	check("location_reservation_configs_age_check", sql`minimum_guest_age IS NULL OR minimum_guest_age >= 0`),
]);

// A deliberate exception to a location's normal reservation availability.
// Row meaning: on this date at this local slot, this location is closed, or
//   seats a different number than the policy implies.
// Null semantics: capacity NULL with status 'closed' means no seats at all;
//   capacity set with status 'open' overrides the slot capacity. time_slot
//   NULL applies to the whole date.
// This is the location-side counterpart of editing a session directly. It does
//   NOT exist on the product side: an experience override is a change to the
//   actual product_sessions row.
// Deletion: cascades from the config.
// Read/write: server/utils/reservations.ts.
export const location_reservation_overrides = sqliteTable("location_reservation_overrides", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	location_id: text().notNull(),
	override_date: text().notNull(),
	time_slot: text(),
	// 'open' | 'closed' (registry in shared/).
	status: text().notNull(),
	capacity: integer(),
	note: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	check("location_reservation_overrides_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [location_reservation_configs.organization_id, location_reservation_configs.location_id], name: "location_reservation_overrides_config_scope_fk" }).onDelete("cascade"),
	uniqueIndex("location_reservation_overrides_slot_unique").on(table.location_id, table.override_date, table.time_slot).where(sql`time_slot IS NOT NULL`),
	uniqueIndex("location_reservation_overrides_date_unique").on(table.location_id, table.override_date).where(sql`time_slot IS NULL`),
	index("location_reservation_overrides_date_idx").on(table.location_id, table.override_date),
	check("location_reservation_overrides_date_check", sql`date(override_date, '+0 days') IS override_date`),
	check("location_reservation_overrides_time_slot_check", sql`time_slot IS NULL OR (time_slot GLOB '[0-2][0-9]:[0-5][0-9]' AND time_slot < '24:00')`),
	check("location_reservation_overrides_capacity_check", sql`capacity IS NULL OR capacity >= 0`),
]);

// A table reservation.
// Row meaning: this party holds this location for this interval, in this state.
// Owner/scope: location, which carries site and organization.
// Null semantics: customer_id NULL is a guest reservation with contact details
//   on the linked request. request_id NULL is a reservation taken without an
//   inbox thread.
// Deletion: cascades from location. An inbox thread cannot be deleted while a
//   reservation links to it; the domain operation unlinks first.
// Read/write: server/utils/reservations.ts for policy,
//   server/domain/requests.ts for the inbox thread linkage.
export const reservations = sqliteTable("reservations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull(),
	location_id: text().notNull(),
	customer_id: text().references((): AnySQLiteColumn => customers.id, { onDelete: "set null" }),
	request_id: text(),
	timezone: text().notNull(),
	starts_at: text().notNull(),
	ends_at: text().notNull(),
	party_size: integer().notNull(),
	// 'pending' | 'confirmed' | 'cancelled' | 'completed' (registry in shared/).
	status: text().default("pending").notNull(),
	cancelled_at: text(),
	completed_at: text(),
	cancellation_reason: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("reservations_instants_check", sql`(strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+0 days') IS starts_at) AND (strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+0 days') IS ends_at) AND (cancelled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', cancelled_at, '+0 days') IS cancelled_at) AND (completed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', completed_at, '+0 days') IS completed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id], name: "reservations_location_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id, table.request_id], foreignColumns: [requests.organization_id, requests.site_id, requests.id], name: "reservations_request_scope_fk" }).onDelete("restrict"),
	uniqueIndex("reservations_request_unique").on(table.request_id).where(sql`request_id IS NOT NULL`),
	index("reservations_location_start_idx").on(table.location_id, table.starts_at, table.status),
	index("reservations_site_created_idx").on(table.site_id, table.created_at),
	index("reservations_customer_idx").on(table.customer_id),
	check("reservations_interval_check", sql`ends_at > starts_at`),
	check("reservations_party_size_check", sql`party_size > 0`),
	check("reservations_timezone_check", sql`timezone <> '' AND timezone NOT GLOB '*[^A-Za-z0-9/_+-]*'`),
]);

// ---------------------------------------------------------------------------
// Inventory.
//
// Optional capability: a service has no inventory row and that is correct, not
// missing data. Stock is variant-and-location identity. It is NOT a price
// attribute and NOT a boolean on products — the old `products.available`
// column conflated a merchant control with a stock count, and both are gone.
//
// Available stock derives from ONE authoritative quantity model: on_hand minus
// reserved, per level. No second counter is maintained anywhere.
// ---------------------------------------------------------------------------

// Row meaning: this variant's stock is tracked.
// Keys: one item per variant.
// Deletion: cascades from variant; cascades to levels.
// Read/write: server/utils/product-management.ts.
export const inventory_items = sqliteTable("inventory_items", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	product_variant_id: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("inventory_items_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.product_variant_id], foreignColumns: [product_variants.organization_id, product_variants.id], name: "inventory_items_variant_scope_fk" }).onDelete("cascade"),
	unique("inventory_items_org_id_unique").on(table.organization_id, table.id),
	unique("inventory_items_variant_unique").on(table.product_variant_id),
]);

// Row meaning: how much of this item is held at this location.
// `on_hand` is physical quantity; `reserved` is the part already allocated.
//   Available is on_hand - reserved, computed, never stored.
// Deletion: cascades from item and from location.
// Read/write: server/utils/product-management.ts.
export const inventory_levels = sqliteTable("inventory_levels", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	inventory_item_id: text().notNull(),
	location_id: text().notNull(),
	on_hand: integer().default(0).notNull(),
	reserved: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.inventory_item_id, table.location_id], name: "inventory_levels_pk" }),
	check("inventory_levels_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.inventory_item_id], foreignColumns: [inventory_items.organization_id, inventory_items.id], name: "inventory_levels_item_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.id], name: "inventory_levels_location_scope_fk" }).onDelete("cascade"),
	index("inventory_levels_location_idx").on(table.location_id),
	check("inventory_levels_quantities_check", sql`on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand`),
]);

// ---------------------------------------------------------------------------
// Stripe identity mapping.
//
// Local ids are local identity. Stripe ids live here, keyed by local entity,
// Stripe account and livemode — never in a metadata key, and a local id is
// never reused as a provider id.
//
// The adapter: Stripe Price references a Stripe Product; locally a price
// references a VARIANT, whose parent identifies the product. So a variant maps
// to a Stripe Product when it is exported. Stripe has no native variant and no
// class-session concept; nothing here pretends otherwise.
//
// An exported default price must belong to the mapped product. It is not a
// universal selector across local variants, currencies or locations — price
// selection is shared/prices.ts, always.
//
// Platform subscription billing (`subscription`, `organization_billing`,
// `stripe_*` webhook tables) is the PLATFORM's billing, not a merchant's
// catalog. These mappings never join to it.
// Read/write: server/utils/stripe-catalog.ts.
// ---------------------------------------------------------------------------
export const stripe_catalog_mappings = sqliteTable("stripe_catalog_mappings", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	// 'product_variant' | 'price' (registry in shared/). Which local relation
	// `local_id` points at.
	local_entity: text().notNull(),
	local_id: text().notNull(),
	stripe_account_id: text().notNull(),
	livemode: integer({ mode: "boolean" }).notNull(),
	// 'prod_...' for a variant, 'price_...' for a price.
	stripe_id: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("stripe_catalog_mappings_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	unique("stripe_catalog_mappings_local_unique").on(table.local_entity, table.local_id, table.stripe_account_id, table.livemode),
	unique("stripe_catalog_mappings_stripe_unique").on(table.stripe_account_id, table.livemode, table.stripe_id),
	index("stripe_catalog_mappings_org_idx").on(table.organization_id, table.local_entity),
	check("stripe_catalog_mappings_livemode_check", sql`livemode IN (0, 1)`),
	check("stripe_catalog_mappings_ids_check", sql`trim(local_id) <> '' AND trim(stripe_id) <> '' AND trim(stripe_account_id) <> ''`),
]);



export const oauthAccessToken = sqliteTable("oauthAccessToken", {
	id: text().primaryKey(),
	clientId: text().notNull(),
	userId: text(),
	token: text().notNull().unique(),
	scopes: text().default("[]").notNull(),
	authorizationCodeId: text(),
	resources: text(),
	requestedUserInfoClaims: text(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	sessionId: text(),
	referenceId: text(),
	refreshId: text(),
	revoked: integer({ mode: "timestamp" }),
	confirmation: text(),
});

export const oauthClient = sqliteTable("oauthClient", {
	id: text().primaryKey(),
	clientId: text().notNull().unique(),
	clientSecret: text(),
	name: text().notNull(),
	redirectUris: text().notNull(),
	scopes: text().default("[]").notNull(),
	clientCredentialsScopes: text().default("[]").notNull(),
	clientDiscoveryId: text(),
	applicationType: text(),
	public: integer().default(0).notNull(),
	requirePKCE: integer().default(1).notNull(),
	skipConsent: integer().default(0).notNull(),
	userId: text(),
	metadata: text(),
	disabled: integer().default(0).notNull(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	updatedAt: integer({ mode: "timestamp" }).notNull(),
	enableEndSession: integer(),
	subjectType: text(),
	uri: text(),
	icon: text(),
	contacts: text(),
	tos: text(),
	policy: text(),
	softwareId: text(),
	softwareVersion: text(),
	softwareStatement: text(),
	postLogoutRedirectUris: text(),
	backchannelLogoutUri: text(),
	backchannelLogoutSessionRequired: integer().default(0).notNull(),
	tokenEndpointAuthMethod: text(),
	jwks: text(),
	jwksUri: text(),
	grantTypes: text(),
	responseTypes: text(),
	type: text(),
	dpopBoundAccessTokens: integer().default(0).notNull(),
	referenceId: text(),
});

export const oauthClientAssertion = sqliteTable("oauthClientAssertion", {
	id: text().primaryKey(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
});

export const oauthResource = sqliteTable("oauthResource", {
	id: text().primaryKey(),
	identifier: text().notNull().unique(),
	name: text().notNull(),
	accessTokenTtl: integer(),
	refreshTokenTtl: integer(),
	signingAlgorithm: text(),
	signingKeyId: text(),
	allowedScopes: text(),
	customClaims: text(),
	dpopBoundAccessTokensRequired: integer().default(0).notNull(),
	disabled: integer().default(0).notNull(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	updatedAt: integer({ mode: "timestamp" }).notNull(),
	policyVersion: integer().default(1).notNull(),
	metadata: text(),
});

export const oauthClientResource = sqliteTable("oauthClientResource", {
	id: text().primaryKey(),
	clientId: text().notNull().references(() => oauthClient.id, { onDelete: "cascade" }),
	resourceId: text().notNull().references(() => oauthResource.id, { onDelete: "cascade" }),
	metadata: text(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
});

export const oauthConsent = sqliteTable("oauthConsent", {
	id: text().primaryKey(),
	clientId: text().notNull(),
	userId: text().notNull(),
	scopes: text().default("").notNull(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	updatedAt: integer({ mode: "timestamp" }).notNull(),
	referenceId: text(),
	resources: text(),
	requestedUserInfoClaims: text(),
}, (table) => [
	unique("oauthConsent_clientId_userId_unique").on(table.clientId, table.userId),
]);

export const oauthRefreshToken = sqliteTable("oauthRefreshToken", {
	id: text().primaryKey(),
	clientId: text().notNull(),
	userId: text(),
	token: text().notNull().unique(),
	scopes: text().default("").notNull(),
	authorizationCodeId: text(),
	resources: text(),
	requestedUserInfoClaims: text(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	createdAt: integer({ mode: "timestamp" }).notNull(),
	sessionId: text(),
	referenceId: text(),
	revoked: integer({ mode: "timestamp" }),
	rotatedAt: integer({ mode: "timestamp" }),
	rotationReplayResponse: text(),
	rotationReplayExpiresAt: integer({ mode: "timestamp" }),
	authTime: integer({ mode: "timestamp" }),
	confirmation: text(),
});

export const organization = sqliteTable("organization", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull().unique(),
	logo: text(),
	metadata: text(),
	// Better Auth Stripe plugin organization customer field.
	stripeCustomerId: text().unique(),
	// Set when an owner asks for the organization to be deleted. Its sites keep
	// serving through the grace period so the request can be cancelled; the
	// deletion-sweep task deletes the organization once this instant has passed,
	// and the foreign-key cascade takes its sites, domains and content with it.
	deletionScheduledAt: integer({ mode: "timestamp" }),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, () => [
	check("organization_slug_required_check", sql`trim(slug) <> ''`),
]);

export const subscription = sqliteTable("subscription", {
	id: text().primaryKey(),
	plan: text().notNull(),
	referenceId: text().notNull(),
	stripeCustomerId: text(),
	stripeSubscriptionId: text().unique(),
	status: text().default("incomplete").notNull(),
	periodStart: integer({ mode: "timestamp" }),
	periodEnd: integer({ mode: "timestamp" }),
	trialStart: integer({ mode: "timestamp" }),
	trialEnd: integer({ mode: "timestamp" }),
	cancelAtPeriodEnd: integer().default(0).notNull(),
	cancelAt: integer({ mode: "timestamp" }),
	canceledAt: integer({ mode: "timestamp" }),
	endedAt: integer({ mode: "timestamp" }),
	seats: integer(),
	billingInterval: text(),
	stripeScheduleId: text(),
}, (table) => [
	index("subscription_referenceId_idx").on(table.referenceId),
	index("subscription_status_idx").on(table.status),
]);

export const organization_billing = sqliteTable("organization_billing", {
	organization_id: text().primaryKey().references(() => organization.id, { onDelete: "cascade" } ),
	payment_status: text().default("unknown").notNull(),
	paid_through: text(),
	past_due_since: text(),
	last_paid_invoice_id: text(),
	last_payment_event_created: integer(),
	last_payment_event_id: text(),
	access_plan: text().default("free").notNull(),
	access_expires_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, () => [
	check("organization_billing_instants_check", sql`(access_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', access_expires_at, '+0 days') IS access_expires_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at) AND (paid_through IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', paid_through, '+0 days') IS paid_through) AND (past_due_since IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', past_due_since, '+0 days') IS past_due_since)`),
]);

export const onboarding_drafts = sqliteTable("onboarding_drafts", {
	id: text().primaryKey(),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	name: text().notNull(),
	vertical: text().notNull(),
	subdomain_candidate: text(),
	source_type: text().notNull(),
	status: text().default("active").notNull(),
	payload_json: text().notNull(),
	committed_site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	committed_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("onboarding_drafts_instants_check", sql`(committed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', committed_at, '+0 days') IS committed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	check("onboarding_drafts_payload_json_check", sql`payload_json IS NULL OR (json_valid(payload_json) AND json_type(payload_json) IS 'object')`),
	uniqueIndex("idx_onboarding_drafts_active_user_unique").on(table.user_id).where(sql`status = 'active'`),
	index("onboarding_drafts_user_id_idx").on(table.user_id),
]);

export const rate_limits = sqliteTable("rate_limits", {
	key: text().primaryKey(),
	count: integer().default(0).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	expires_at: text(),
}, (table) => [
	check("rate_limits_instants_check", sql`(updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at) AND (expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, '+0 days') IS expires_at)`),
	index("idx_rate_limits_expires").on(table.expires_at),
]);



export const review_requests = sqliteTable("review_requests", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	customer_id: text().notNull().references(() => customers.id, { onDelete: "cascade" } ),
	booking_type: text().notNull(),
	booking_id: text().notNull(),
	token_hash: text().notNull().unique(),
	expires_at: text().notNull(),
	first_sent_at: text(),
	reminder_sent_at: text(),
	submitted_at: text(),
	clicked_at: text(),
	revoked_at: text(),
	send_count: integer().default(0).notNull(),
	last_error: text(),
	anonymous_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	user_id: text().references(() => user.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("review_requests_instants_check", sql`(expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, '+0 days') IS expires_at) AND (first_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', first_sent_at, '+0 days') IS first_sent_at) AND (reminder_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', reminder_sent_at, '+0 days') IS reminder_sent_at) AND (submitted_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', submitted_at, '+0 days') IS submitted_at) AND (clicked_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', clicked_at, '+0 days') IS clicked_at) AND (revoked_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at, '+0 days') IS revoked_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
 foreignKey({ columns: [table.organization_id, table.site_id, table.booking_id, table.booking_type], foreignColumns: [requests.organization_id, requests.site_id, requests.id, requests.kind], name: "review_requests_booking_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "review_requests_site_scope_fk" }).onDelete("cascade"),
	uniqueIndex("idx_review_requests_active_booking_unique")
		.on(table.site_id, table.booking_type, table.booking_id)
		.where(sql`revoked_at IS NULL AND submitted_at IS NULL`),
	index("idx_review_requests_send_due").on(table.site_id, table.first_sent_at, table.reminder_sent_at, table.submitted_at, table.expires_at),
	index("review_requests_organization_id_idx").on(table.organization_id),
]);

// U4/U9: durable KrabiClaw authorization and recovery record for public legal
// (Blawby) intake requests. id is the R14 browser-generated UUID v4 request
// reference — the row's primary key IS the idempotency key, not a separate
// surrogate id. organization_id/site_id use "restrict" (not "cascade", unlike
// review_requests) because this is a legal-request attribution record: the
// data model explicitly says it "must not cascade-delete legal request
// attribution," so an org/site delete must be blocked rather than silently
// erasing the record — following the same "restrict" precedent already used
// for site_transfer_requests.initiated_by_user_id below rather than inventing
// a new FK policy. original_actor_id is likewise "restrict" (never silently
// nulled) since R15 requires it stay immutable; current_authorized_user_id
// stays "set null" (matching review_requests.user_id) since it is explicitly
// the nullable, replaceable-by-linking field. blawby_intake_id and
// checkout_session_id are separately unique so two request references can
// never bind the same upstream identifier (R17).
export const legal_intake_references = sqliteTable("legal_intake_references", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "restrict" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "restrict" } ),
	original_actor_id: text().notNull().references(() => user.id, { onDelete: "restrict" } ),
	original_actor_kind: text().notNull(),
	current_authorized_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	payload_digest: text().notNull(),
	digest_key_id: text().notNull(),
	digest_version: integer().notNull(),
	blawby_intake_id: text().unique(),
	checkout_session_id: text().unique(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "legal_intake_references_site_scope_fk" }).onDelete("restrict"),
	// Membership is normally kept out of the schema because D1 cannot rebuild a
	// referenced parent when a value set grows. Nothing references this table,
	// so it can be rebuilt, and the check earns its place.
	check("legal_intake_references_actor_kind_check", sql`original_actor_kind IN ('human', 'anonymous')`),
	index("idx_legal_intake_references_site_actor").on(table.site_id, table.original_actor_id),
	index("legal_intake_references_organization_id_idx").on(table.organization_id),
	// U9 reconciliation (task-u8-reconciliation-brief.md section 6):
	// linkLegalIntakeAuthorizedUser's account-link query
	// (server/utils/legal-intake-references.ts) filters on
	// original_actor_id alone, with no site_id predicate -- it cannot use
	// idx_legal_intake_references_site_actor's leftmost-prefix (site_id
	// leads that index), so it was a full table scan on every Better Auth
	// account-link event. This index leads with original_actor_id so that
	// query can use it. The existing (site_id, original_actor_id) index is
	// left untouched -- it still serves the more frequent per-request
	// site+actor ownership lookup (findLegalIntakeReferenceForActor).
	index("idx_legal_intake_references_actor").on(table.original_actor_id),
]);

export const reviews = sqliteTable("reviews", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	customer_id: text().references(() => customers.id, { onDelete: "set null" } ),
	booking_id: text(),
	booking_type: text(),
	review_request_id: text().references(() => review_requests.id, { onDelete: "set null" } ),
	user_id: text().references(() => user.id, { onDelete: "set null" } ),
	product_id: text(),
	author_name: text(),
	rating: integer().notNull(),
	title: text(),
	content: text(),
	google_review_id: text(),
	google_review_metadata: text(),
	owner_reply: text(),
	owner_reply_at: text(),
	helpful_count: integer().default(0).notNull(),
	status: text().default("pending").notNull(),
	source: text().default("direct").notNull(),
	entered_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	collection_method: text(),
	original_review_date: text(),
	original_reference: text(),
	publication_authorized: integer().default(0).notNull(),
	ip_hash: text(),
	user_agent: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("reviews_instants_check", sql`(owner_reply_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', owner_reply_at, '+0 days') IS owner_reply_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "reviews_site_scope_fk" }).onDelete("cascade"),
	check("reviews_google_review_metadata_check", sql`google_review_metadata IS NULL OR (json_valid(google_review_metadata) AND json_type(google_review_metadata) IS 'object')`),
	uniqueIndex("reviews_google_review_scope_unique").on(table.organization_id, table.site_id, table.location_id, table.google_review_id),
	// The catalog is organization-owned, so a product review scopes to
	// (organization, product). The review's own site/location remain its
	// display scope and are unrelated to where the Product is offered.
	foreignKey({
		columns: [table.organization_id, table.product_id],
		foreignColumns: [products.organization_id, products.id],
		name: "reviews_product_scope_fk",
	}).onDelete("restrict"),
	index("idx_reviews_request_id").on(table.review_request_id),
	index("idx_reviews_customer_id").on(table.customer_id),
	index("idx_reviews_location_status").on(table.location_id, table.status, table.created_at),
	index("idx_reviews_site_status").on(table.site_id, table.status, table.created_at).where(sql`location_id IS NULL`),
	index("idx_reviews_product_status_created").on(table.product_id, table.status, table.created_at),
	check("reviews_rating_check", sql`rating BETWEEN 1 AND 5`),
	check("reviews_product_scope_check", sql`product_id IS NULL OR (organization_id IS NOT NULL AND site_id IS NOT NULL)`),
	check("reviews_owner_entered_provenance_check", sql`source != 'owner_entered' OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NULL AND entered_by_user_id IS NOT NULL AND collection_method IS NOT NULL AND publication_authorized = 1)`),
	index("reviews_organization_id_idx").on(table.organization_id),
]);

export const session = sqliteTable("session", {
	id: text().primaryKey(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	token: text().notNull().unique(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	ipAddress: text(),
	userAgent: text(),
	activeOrganizationId: text(),
	activeTeamId: text(),
	impersonatedBy: text(),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
}, (table) => [
	index("session_userId_idx").on(table.userId),
]);



export const site_redirects = sqliteTable("site_redirects", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	owner_type: text(),
	owner_id: text(),
	from_path: text().notNull(),
	to_path: text(),
	status_code: integer().default(301).notNull(),
	behavior: text().default("redirect").notNull(),
	reason: text(),
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("site_redirects_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "site_redirects_site_scope_fk" }).onDelete("cascade"),
	unique("site_redirects_site_locale_from_path_unique").on(table.site_id, table.locale, table.from_path),
	check("site_redirects_from_path_check", sql`from_path LIKE '/%'`),
	check("site_redirects_redirect_to_path_check", sql`behavior != 'redirect' OR to_path IS NOT NULL`),
	check("site_redirects_owner_check", sql`(owner_type IS NULL AND owner_id IS NULL) OR (owner_type IS NOT NULL AND owner_id IS NOT NULL)`),
	index("site_redirects_organization_id_idx").on(table.organization_id),
	index("site_redirects_owner_idx").on(table.owner_type, table.owner_id),
]);


export const site_domains = sqliteTable("site_domains", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "cascade" } ),
	former_site_id: text(),
	successor_domain: text(),
	retired_at: text(),
	reconciliation_token: text(),
	reconciliation_expires_at: text(),
	desired_state: text({ enum: ["active", "deleted"] }).default("active").notNull(),
	domain: text().notNull().unique(),
	type: text().notNull(),
	role: text().default("secondary").notNull(),
	status: text().default("pending").notNull(),
	cloudflare_hostname_id: text().unique(),
	cloudflare_hostname_status: text(),
	cloudflare_ssl_status: text(),
	ownership_validation_name: text(),
	ownership_validation_type: text(),
	ownership_validation_value: text(),
	ssl_validation_name: text(),
	ssl_validation_type: text(),
	ssl_validation_value: text(),
	ssl_validation_name_2: text(),
	ssl_validation_type_2: text(),
	ssl_validation_value_2: text(),
	validation_strategy: text().default("http_auto").notNull(),
	dcv_delegation_name: text(),
	dcv_delegation_type: text(),
	dcv_delegation_value: text(),
	dns_target: text(),
	dns_status: text().default("pending").notNull(),
	dns_last_resolved_at: text(),
	dns_resolved_target: text(),
	last_synced_at: text(),
	next_check_at: text(),
	retry_count: integer().default(0).notNull(),
	activated_at: text(),
	certificate_last_active_at: text(),
	renewal_issue_started_at: text(),
	renewal_notification_sent_at: text(),
	certificate_expires_at: text(),
	error_message: text(),
	metadata: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("site_domains_instants_check", sql`(retired_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', retired_at, '+0 days') IS retired_at) AND (reconciliation_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', reconciliation_expires_at, '+0 days') IS reconciliation_expires_at) AND (dns_last_resolved_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', dns_last_resolved_at, '+0 days') IS dns_last_resolved_at) AND (last_synced_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', last_synced_at, '+0 days') IS last_synced_at) AND (next_check_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', next_check_at, '+0 days') IS next_check_at) AND (activated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', activated_at, '+0 days') IS activated_at) AND (certificate_last_active_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', certificate_last_active_at, '+0 days') IS certificate_last_active_at) AND (renewal_issue_started_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', renewal_issue_started_at, '+0 days') IS renewal_issue_started_at) AND (renewal_notification_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', renewal_notification_sent_at, '+0 days') IS renewal_notification_sent_at) AND (certificate_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', certificate_expires_at, '+0 days') IS certificate_expires_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	check("site_domains_owner_check", sql`(status = 'retired' AND type = 'subdomain' AND role = 'secondary' AND organization_id IS NULL AND site_id IS NULL AND former_site_id IS NOT NULL AND retired_at IS NOT NULL) OR (status <> 'retired' AND organization_id IS NOT NULL AND site_id IS NOT NULL AND former_site_id IS NULL AND retired_at IS NULL AND successor_domain IS NULL)`),
	check("site_domains_desired_state_check", sql`desired_state IN ('active', 'deleted') AND (desired_state <> 'deleted' OR type = 'custom')`),
	check("site_domains_lease_check", sql`(reconciliation_token IS NULL) = (reconciliation_expires_at IS NULL)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "site_domains_site_scope_fk" }).onDelete("cascade"),
	check("site_domains_metadata_check", sql`metadata IS NULL OR (json_valid(metadata))`),
	index("site_domains_org_site_idx").on(table.organization_id, table.site_id),
	uniqueIndex("idx_site_domains_one_canonical").on(table.site_id).where(sql`role = 'canonical' AND status = 'active'`),
	uniqueIndex("site_domains_one_active_subdomain").on(table.site_id).where(sql`type = 'subdomain' AND status = 'active'`),
	index("idx_site_domains_reconcile").on(table.status, table.next_check_at),
]);



export const site_locales = sqliteTable("site_locales", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	label: text(),
	is_source: integer({ mode: "boolean" }).default(false).notNull(),
	status: text().default("disabled").notNull(),
	activated_at: text(),
	disabled_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("site_locales_instants_check", sql`(activated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', activated_at, '+0 days') IS activated_at) AND (disabled_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', disabled_at, '+0 days') IS disabled_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "site_locales_site_scope_fk" }).onDelete("cascade"),
	unique("site_locales_organization_id_site_id_locale_unique").on(table.organization_id, table.site_id, table.locale),
	uniqueIndex("idx_site_locales_one_source_per_site").on(table.organization_id, table.site_id).where(sql`is_source = 1`),
	check("site_locales_status_check", sql`status IN ('published', 'disabled') AND (is_source = 0 OR status = 'published')`),
	check("site_locales_english_source_check", sql`locale <> 'en' OR (is_source = 1 AND status = 'published')`),
]);

export const mcp_tool_call_events = sqliteTable("mcp_tool_call_events", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	user_id: text().references(() => user.id, { onDelete: "set null" } ),
	mcp_surface: text().default("client").notNull(),
	request_id: text(),
	method: text().notNull(),
	tool_name: text(),
	tool_domain: text(),
	is_mutating: integer(),
	arguments_summary_json: text(),
	result_summary_json: text(),
	status: text().notNull(),
	error_code: text(),
	error_message: text(),
	http_status: integer(),
	jsonrpc_error_code: integer(),
	jsonrpc_error_message: text(),
	protocol_version: text(),
	session_id_hash: text(),
	oauth_client_id_hash: text(),
	user_agent: text(),
	cf_ray_id: text(),
	catalog_fingerprint: text(),
	unknown_tool_name: text(),
	duration_ms: integer(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("mcp_tool_call_events_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
	check("mcp_tool_call_events_arguments_summary_json_check", sql`arguments_summary_json IS NULL OR (json_valid(arguments_summary_json))`),
	check("mcp_tool_call_events_result_summary_json_check", sql`result_summary_json IS NULL OR (json_valid(result_summary_json))`),
	check("mcp_tool_call_events_duration_check", sql`duration_ms >= 0`),
	index("idx_mcp_tool_call_events_created_at").on(table.created_at),
	index("idx_mcp_tool_call_events_tool_status").on(table.tool_name, table.status),
	index("idx_mcp_tool_call_events_site").on(table.site_id, table.created_at),
	index("idx_mcp_tool_call_events_org").on(table.organization_id, table.created_at),
	index("idx_mcp_tool_call_events_method_created").on(table.method, table.created_at),
	index("idx_mcp_tool_call_events_session").on(table.session_id_hash, table.created_at),
	index("idx_mcp_tool_call_events_unknown").on(table.unknown_tool_name, table.created_at),
]);

export const sites = sqliteTable("sites", {
	id: text().primaryKey(),
	settings_json: text({ mode: "json" }).$type<SiteSettings>().default({ config: { default_timezone: 'UTC' } }).notNull(),
	integrations_json: text({ mode: "json" }).$type<SiteIntegrations>().default({}).notNull(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	theme_id: text().default("saya-theme-v1").notNull(),
	slug: text().notNull().unique(),
	subdomain: text().unique(),
	brand_name: text(),
	brand_description: text(),
	contact_email: text(),
	contact_phone: text(),
	default_currency: text().default("THB").notNull(),
	status: text().default("active").notNull(),
	onboarding_status: text().default("pending").notNull(),
	url_structure: text().default("location_subdirectories").notNull(),
	vertical: text().default("restaurant").notNull(),
	last_published_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	// Brand-level social profiles, rendered in the site footer only. Distinct from a location's
	// own facebook_url/instagram_url/tiktok_url on business_locations — the two never merge.
	social_facebook_url: text(),
	social_instagram_url: text(),
	social_tiktok_url: text(),
	// Better Auth Team scoping this site to non-org-wide editors (see business_locations.team_id
	// for the per-location equivalent). An editor belonging to this team gets site-wide access
	// including every location under it.
	team_id: text().references((): AnySQLiteColumn => team.id, { onDelete: "set null" } ),
	// JSON { enabled?: ProductFeature[]; disabled?: ProductFeature[] } delta (config/cms-registry.ts)
	// layered additively/subtractively on top of the vertical's own module defaults — NULL means
	// "use vertical defaults as-is." Only real business modules (products/ordering/reservations/
	// experiences/services) are ever stored here; content managers (blog/qa/reviews/posts/photos/
	// media) are always-on and never appear in this column.
	feature_overrides: text(),
	analytics_data_start_at: text(),
}, (table) => [
	check("sites_instants_check", sql`(last_published_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', last_published_at, '+0 days') IS last_published_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at) AND (analytics_data_start_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', analytics_data_start_at, '+0 days') IS analytics_data_start_at)`),
	check("sites_settings_json_check", sql`json_valid(settings_json) AND json_type(settings_json) IS 'object'`),
	check("sites_integrations_json_check", sql`json_valid(integrations_json) AND json_type(integrations_json) IS 'object'`),
	check("sites_config_brand_color_check", sql`json_type(settings_json, '$.config.brand_color') IS NULL OR json_type(settings_json, '$.config.brand_color') IS 'text'`),
	check("sites_config_press_email_check", sql`json_type(settings_json, '$.config.press_email') IS NULL OR json_type(settings_json, '$.config.press_email') IS 'text'`),
	check("sites_config_partnerships_email_check", sql`json_type(settings_json, '$.config.partnerships_email') IS NULL OR json_type(settings_json, '$.config.partnerships_email') IS 'text'`),
	check("sites_config_catering_email_check", sql`json_type(settings_json, '$.config.catering_email') IS NULL OR json_type(settings_json, '$.config.catering_email') IS 'text'`),
	check("sites_config_careers_email_check", sql`json_type(settings_json, '$.config.careers_email') IS NULL OR json_type(settings_json, '$.config.careers_email') IS 'text'`),
	check("sites_config_google_site_verification_check", sql`json_type(settings_json, '$.config.google_site_verification') IS NULL OR json_type(settings_json, '$.config.google_site_verification') IS 'text'`),
	check("sites_config_default_timezone_check", sql`json_type(settings_json, '$.config.default_timezone') IS 'text' AND length(json_extract(settings_json, '$.config.default_timezone')) > 0`),
	check("sites_config_whatsapp_phone_check", sql`json_type(settings_json, '$.config.whatsapp_phone') IS NULL OR json_type(settings_json, '$.config.whatsapp_phone') IS 'text'`),
	check("sites_config_notifications_check", sql`json_type(settings_json, '$.config.owner_notification_channels') IS NULL OR json_type(settings_json, '$.config.owner_notification_channels') IS 'array'`),
	check("sites_consultation_metadata_check", sql`json_type(settings_json, '$.consultation.metadata_json') IS NULL OR json_type(settings_json, '$.consultation.metadata_json') IN ('null', 'object')`),
	check("sites_compliance_metadata_check", sql`json_type(settings_json, '$.compliance.metadata_json') IS NULL OR json_type(settings_json, '$.compliance.metadata_json') IN ('null', 'object')`),
	check("sites_theme_saya_check", sql`json_type(settings_json, '$.theme_by_template.saya') IS NULL OR (json_type(settings_json, '$.theme_by_template.saya') IS 'object' AND json_type(settings_json, '$.theme_by_template.saya.tokens') IS 'object' AND json_extract(settings_json, '$.theme_by_template.saya.status') IN ('active', 'disabled')) IS TRUE`),
	check("sites_theme_blawby_check", sql`json_type(settings_json, '$.theme_by_template.blawby') IS NULL OR (json_type(settings_json, '$.theme_by_template.blawby') IS 'object' AND json_type(settings_json, '$.theme_by_template.blawby.tokens') IS 'object' AND json_extract(settings_json, '$.theme_by_template.blawby.status') IN ('active', 'disabled')) IS TRUE`),
	check("sites_config_object_check", sql`json_type(settings_json, '$.config') IS NULL OR json_type(settings_json, '$.config') IS 'object'`),
	check("sites_theme_by_template_object_check", sql`json_type(settings_json, '$.theme_by_template') IS NULL OR json_type(settings_json, '$.theme_by_template') IS 'object'`),
	check("sites_consultation_object_check", sql`json_type(settings_json, '$.consultation') IS NULL OR json_type(settings_json, '$.consultation') IS 'object'`),
	check("sites_compliance_object_check", sql`json_type(settings_json, '$.compliance') IS NULL OR json_type(settings_json, '$.compliance') IS 'object'`),
	check("sites_consultation_check", sql`json_type(settings_json, '$.consultation') IS NULL OR (json_extract(settings_json, '$.consultation.mode') IN ('external_url', 'native_disabled') AND json_type(settings_json, '$.consultation.cta_label') IS 'text' AND json_extract(settings_json, '$.consultation.schedule_path') LIKE '/%' AND json_extract(settings_json, '$.consultation.confirmation_path') LIKE '/%' AND json_type(settings_json, '$.consultation.tracking_enabled') IN ('true', 'false')) IS TRUE`),
	check("sites_compliance_check", sql`json_type(settings_json, '$.compliance') IS NULL OR (json_extract(settings_json, '$.compliance.address_visibility') IN ('visible', 'hidden') AND (json_extract(settings_json, '$.compliance.service_area_type') IS NULL OR json_extract(settings_json, '$.compliance.service_area_type') IN ('AdministrativeArea', 'City', 'Country', 'Place', 'State')) AND json_type(settings_json, '$.compliance.same_as') IN ('array', 'null') AND json_type(settings_json, '$.compliance.contact_points') IN ('array', 'null')) IS TRUE`),
	check("sites_compliance_nonprofit_check", sql`json_extract(settings_json, '$.compliance.nonprofit_status') IS NULL OR json_extract(settings_json, '$.compliance.nonprofit_status') IN (${sql.raw([...NONPROFIT_STATUS_CANONICAL].map(value => `'${value}'`).join(', '))})`),
	check("sites_facebook_integration_check", sql`json_type(integrations_json, '$.facebook') IS NULL OR (json_type(integrations_json, '$.facebook') IS 'object' AND json_type(integrations_json, '$.facebook.revision') IS 'text' AND json_extract(integrations_json, '$.facebook.kind') IN ('oauth') AND json_extract(integrations_json, '$.facebook.status') IN ('active', 'disabled', 'error')) IS TRUE`),
	check("sites_google_integration_check", sql`json_type(integrations_json, '$.google') IS NULL OR (json_type(integrations_json, '$.google') IS 'object' AND json_type(integrations_json, '$.google.revision') IS 'text' AND json_extract(integrations_json, '$.google.kind') IN ('oauth', 'manual') AND json_extract(integrations_json, '$.google.status') IN ('active', 'disabled', 'error')) IS TRUE`),
	check("sites_google_credentials_check", sql`json_type(integrations_json, '$.google') IS NULL OR (CASE json_extract(integrations_json, '$.google.kind') WHEN 'oauth' THEN json_type(integrations_json, '$.google.encrypted_access_token') IS 'text' AND json_type(integrations_json, '$.google.encrypted_refresh_token') IS 'text' WHEN 'manual' THEN json_type(integrations_json, '$.google.encrypted_access_token') IS NULL AND json_type(integrations_json, '$.google.encrypted_refresh_token') IS NULL END) IS TRUE`),
	check("sites_facebook_credentials_check", sql`json_type(integrations_json, '$.facebook') IS NULL OR json_type(integrations_json, '$.facebook.encrypted_user_token') IS 'text'`),
	check("sites_feature_overrides_check", sql`feature_overrides IS NULL OR (json_valid(feature_overrides) AND json_type(feature_overrides) IS 'object')`),
	// organization_id is the join/filter column in dozens of call sites across the codebase
	// (dashboard context resolution, MCP site listing/auth, billing, editor routes). Confirmed
	// via wrangler d1 insights as driving two of the top four rows-read queries post-cron-fix
	// (66.9M rows/9,778 executions and 17.2M rows/4,034 executions) - without this index those
	// queries full-scan sites on every request.
	unique("sites_organization_id_id_unique").on(table.organization_id, table.id),
	// scripts/reset-e2e-artifacts.ts's category-1 "is this org still in-flight" check does
	// WHERE created_at >= ? against this table to decide whether to skip a disposable org - with
	// no index, that's a full scan of sites on every sweep, which is what kept exceeding D1's CPU
	// budget on staging even after both org-eligibility and the category-2 guest-row sweep were
	// fixed to be cheap. Verified via EXPLAIN QUERY PLAN: SCAN sites -> SEARCH ... USING INDEX.
	index("sites_created_at_idx").on(table.created_at),
]);

export const stripe_webhook_events = sqliteTable("stripe_webhook_events", {
	id: text().primaryKey(),
	stripe_event_id: text().notNull().unique(),
	event_type: text(),
	status: text().default("pending").notNull(),
	payload: text(),
	error: text(),
	claimed_at: text(),
	lease_expires_at: text(),
	claim_token: text(),
	next_attempt_at: text(),
	dead_lettered_at: text(),
	attempt_count: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("stripe_webhook_events_instants_check", sql`(claimed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', claimed_at, '+0 days') IS claimed_at) AND (lease_expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', lease_expires_at, '+0 days') IS lease_expires_at) AND (next_attempt_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', next_attempt_at, '+0 days') IS next_attempt_at) AND (dead_lettered_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', dead_lettered_at, '+0 days') IS dead_lettered_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
	check("stripe_webhook_events_payload_check", sql`payload IS NULL OR (json_valid(payload))`),
	index("stripe_webhook_events_retry_idx").on(table.status, table.next_attempt_at),
]);

export const stripe_subscription_versions = sqliteTable("stripe_subscription_versions", {
	stripe_subscription_id: text().primaryKey(),
	last_event_created: integer().notNull(),
	last_event_id: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, () => [
	check("stripe_subscription_versions_instants_check", sql`(updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
]);

export const stripe_invoice_payments = sqliteTable("stripe_invoice_payments", {
	stripe_invoice_id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	stripe_subscription_id: text().notNull(),
	base_plan_price_id: text(),
	status: text().notNull(),
	period_start: text(),
	period_end: text(),
	past_due_since: text(),
	last_event_created: integer().notNull(),
	last_event_id: text().notNull(),
	ga4_purchase_status: text().default("pending").notNull(),
	ga4_purchase_event_id: text(),
	ga4_purchase_attempt_count: integer().default(0).notNull(),
	ga4_purchase_claimed_at: text(),
	ga4_purchase_sent_at: text(),
	ga4_purchase_error: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("stripe_invoice_payments_instants_check", sql`(ga4_purchase_claimed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ga4_purchase_claimed_at, '+0 days') IS ga4_purchase_claimed_at) AND (ga4_purchase_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', ga4_purchase_sent_at, '+0 days') IS ga4_purchase_sent_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at) AND (period_start IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', period_start, '+0 days') IS period_start) AND (period_end IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', period_end, '+0 days') IS period_end) AND (past_due_since IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', past_due_since, '+0 days') IS past_due_since)`),
	index("stripe_invoice_payments_organization_idx").on(table.organization_id, table.period_end),
	index("stripe_invoice_payments_subscription_idx").on(table.stripe_subscription_id, table.period_end),
]);

export const stripe_ga4_subscription_intents = sqliteTable("stripe_ga4_subscription_intents", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	stripe_subscription_id: text(),
	action: text().notNull(),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	client_id: text(),
	session_id: text(),
	session_captured_at: integer(),
	previous_price_id: text(),
	new_price_id: text(),
	effective_timing: text().default("immediate").notNull(),
	source: text().default("browser").notNull(),
	status: text().default("pending").notNull(),
	lifecycle_sent_at: text(),
	consumed_at: text(),
	consumed_event_id: text(),
	expires_at: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("stripe_ga4_subscription_intents_instants_check", sql`(lifecycle_sent_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', lifecycle_sent_at, '+0 days') IS lifecycle_sent_at) AND (consumed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', consumed_at, '+0 days') IS consumed_at) AND (expires_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', expires_at, '+0 days') IS expires_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	index("stripe_ga4_subscription_intents_subscription_idx").on(table.stripe_subscription_id, table.status, table.created_at),
	index("stripe_ga4_subscription_intents_organization_idx").on(table.organization_id, table.status, table.created_at),
	index("stripe_ga4_subscription_intents_expiry_idx").on(table.status, table.expires_at),
]);

export const usage_events = sqliteTable("usage_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	resource: text().notNull(),
	source: text().notNull(),
	provider: text(),
	channel: text(),
	session_id: text(),
	quantity: integer().notNull(),
	unit: text().notNull(),
	metadata_json: text(),
	idempotency_key: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("usage_events_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
	check("usage_events_metadata_json_check", sql`metadata_json IS NULL OR (json_valid(metadata_json))`),
	unique("usage_events_organization_id_idempotency_key_unique").on(table.organization_id, table.idempotency_key),
	index("usage_events_organization_resource_created_idx").on(table.organization_id, table.resource, table.created_at),
	index("usage_events_site_created_idx").on(table.site_id, table.created_at),
]);

export const user = sqliteTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: integer({ mode: "boolean" }).default(false).notNull(),
	image: text(),
	phoneNumber: text().unique(),
	phoneNumberVerified: integer().default(0).notNull(),
	role: text().default("user"),
	banned: integer().default(0),
	banReason: text(),
	banExpires: integer({ mode: "timestamp" }),
	isAnonymous: integer().default(0).notNull(),
	// Better Auth Stripe plugin user customer field. Organization subscriptions
	// use organization.stripeCustomerId instead.
	stripeCustomerId: text(),
	// Set when the account holder asks for deletion. The account stays usable
	// through the grace period so the request can be cancelled; the
	// deletion-sweep task removes the row once this instant has passed.
	deletionScheduledAt: integer({ mode: "timestamp" }),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const verification = sqliteTable("verification", {
	id: text().primaryKey(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});




export const user_workspace_state = sqliteTable("user_workspace_state", {
	user_id: text().primaryKey().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	whatsapp_pending_confirmation: text(),
	whatsapp_last_inbound_id: text(),
	whatsapp_updated_at: text(),
}, (table) => [
	check("user_workspace_state_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at) AND (whatsapp_updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', whatsapp_updated_at, '+0 days') IS whatsapp_updated_at)`),
	check("user_workspace_state_whatsapp_pending_check", sql`whatsapp_pending_confirmation IS NULL OR (json_valid(whatsapp_pending_confirmation) AND json_type(whatsapp_pending_confirmation) IS 'object')`),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "user_workspace_state_site_scope_fk" }),
]);



export const content_documents = sqliteTable("content_documents", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	kind: text().$type<typeof CONTENT_DOCUMENT_KINDS[number]>().notNull(),
	row_role: text().$type<'root' | 'representation'>().notNull(),
	root_id: text(),
	root_role: text().$type<'root'>(),
	locale: text(),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" }),
	// The canonical product page binding, on ROOT rows only. Localized
	// representations inherit it through root_id and must not duplicate it.
	// A product slug and a document route have different owners: this foreign
	// key is the relationship, never a '/menu/<slug>' string convention. Other
	// documents may display the same Product through block references without
	// becoming additional canonical pages. Deleting or unpublishing the document
	// never touches the Product; deleting a Product that still has a canonical
	// page is refused until the page is explicitly unbound or deleted.
	product_id: text(),
	scope_path: text(),
	title: text(),
	slug: text(),
	path: text(),
	summary: text(),
	status: text(),
	visibility: text(),
	sort_order: integer().default(0).notNull(),
	source: text(),
	author_id: text().references(() => user.id, { onDelete: "set null" }),
	created_by: text(),
	updated_by: text(),
	published_at: text(),
	first_published_at: text(),
	scheduled_for: text(),
	seo_title: text(),
	seo_description: text(),
	seo_keywords: text(),
	canonical_url: text(),
	robots: text(),
	metadata_json: text().default('{}').notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("content_documents_instants_check", sql`(published_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', published_at, '+0 days') IS published_at) AND (first_published_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', first_published_at, '+0 days') IS first_published_at) AND (scheduled_for IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for, '+0 days') IS scheduled_for) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({ columns: [table.organization_id, table.site_id, table.location_id], foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id], name: "content_documents_location_scope_fk" }).onDelete("cascade"),
	// RESTRICT, not SET NULL: this is a composite key, and SQLite's SET NULL
	// would null organization_id too, which is NOT NULL — the delete would fail
	// with a confusing constraint error instead of unlinking. Deleting a Product
	// that still has a canonical page is refused; the domain operation unbinds
	// or deletes the page first, explicitly.
	foreignKey({ columns: [table.organization_id, table.product_id], foreignColumns: [products.organization_id, products.id], name: "content_documents_product_scope_fk" }).onDelete("restrict"),
	// At most one canonical product page per site per product. Scoped to root
	// rows so locale representations are unaffected, and per site so two sites
	// publishing one Product each get their own canonical page.
	uniqueIndex("content_documents_product_root_unique").on(table.site_id, table.product_id).where(sql`row_role = 'root' AND product_id IS NOT NULL`),
	unique("content_documents_scope_role_unique").on(table.organization_id, table.site_id, table.id, table.row_role, table.kind),
	foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "content_documents_site_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id, table.root_id, table.root_role, table.kind], foreignColumns: [table.organization_id, table.site_id, table.id, table.row_role, table.kind], name: "content_documents_root_scope_fk" }).onDelete("cascade"),
	foreignKey({ columns: [table.organization_id, table.site_id, table.locale], foreignColumns: [site_locales.organization_id, site_locales.site_id, site_locales.locale], name: "content_documents_locale_scope_fk" }).onDelete("cascade"),
	uniqueIndex("content_documents_root_locale_unique").on(table.root_id, table.locale).where(sql`row_role = 'representation'`),
	uniqueIndex("content_documents_route_unique").on(table.site_id, table.locale, table.path).where(sql`row_role IN ('root','representation') AND path IS NOT NULL`),
	uniqueIndex("content_documents_slug_unique").on(table.site_id, table.kind, table.locale, table.slug).where(sql`row_role IN ('root','representation') AND slug IS NOT NULL`),
	uniqueIndex("content_documents_links_site_unique").on(table.site_id).where(sql`row_role = 'root' AND kind = 'page' AND json_extract(metadata_json, '$.recipe') = 'links'`),
	index("content_documents_site_kind_status_idx").on(table.site_id, table.kind, table.row_role, table.status, table.sort_order),
	index("content_documents_location_kind_status_idx").on(table.location_id, table.kind, table.row_role, table.status, table.sort_order),
	index("content_documents_schedule_idx").on(table.kind, table.status, table.scheduled_for).where(sql`row_role = 'root' AND status = 'scheduled'`),
	index("content_documents_facebook_post_idx").on(table.site_id, sql`(metadata_json ->> '$.channels.facebook.provider_post_id')`).where(sql`row_role = 'root' AND kind = 'social_post'`),
	index("content_documents_instagram_post_idx").on(table.site_id, sql`(metadata_json ->> '$.channels.instagram.provider_post_id')`).where(sql`row_role = 'root' AND kind = 'social_post'`),
	check("content_documents_metadata_check", sql`json_valid(metadata_json) AND json_type(metadata_json) IS 'object'`),
	check("content_documents_role_check", sql`(row_role = 'root' AND root_id IS NULL AND root_role IS NULL AND locale = 'en') OR (row_role = 'representation' AND root_id IS NOT NULL AND root_id <> id AND root_role = 'root' AND locale IS NOT NULL AND locale <> 'en' AND product_id IS NULL AND location_id IS NULL AND scope_path IS NULL AND status IS NULL AND visibility IS NULL AND source IS NULL AND author_id IS NULL AND published_at IS NULL AND first_published_at IS NULL AND scheduled_for IS NULL)`),
	check("content_documents_path_check", sql`path IS NULL OR (path LIKE '/%' AND path NOT LIKE '//%')`),
	check("content_documents_page_copy_check", sql`kind <> 'page' OR (path IS NOT NULL AND title IS NOT NULL)`),
	check("content_documents_page_type_check", sql`kind <> 'page' OR row_role <> 'root' OR ((metadata_json ->> '$.page_type') IN ('custom','recipe','legal','system')) IS 1`),
	check("content_documents_channel_names_check", sql`kind <> 'social_post' OR row_role <> 'root' OR json_type(metadata_json, '$.channels') IS NULL OR (json_type(metadata_json, '$.channels') IS 'object' AND json_remove(json_extract(metadata_json, '$.channels'), '$.facebook', '$.instagram') = '{}')`),
	check("content_documents_qa_scope_check", sql`kind <> 'qa' OR row_role <> 'root' OR ((location_id IS NULL OR scope_path IS NULL) AND (scope_path IS NULL OR scope_path LIKE '/%'))`),
	check("content_documents_publication_check", sql`row_role <> 'root' OR kind NOT IN ('article', 'social_post') OR (status IN ('draft','published','scheduled')) IS 1`),
	check("content_documents_social_schedule_check", sql`kind <> 'social_post' OR row_role <> 'root' OR ((status = 'draft' AND scheduled_for IS NULL AND published_at IS NULL) OR (status = 'scheduled' AND scheduled_for IS NOT NULL AND published_at IS NULL) OR (status = 'published' AND scheduled_for IS NULL AND published_at IS NOT NULL))`),
	check("content_documents_article_visibility_check", sql`kind NOT IN ('article','social_post') OR row_role <> 'root' OR (visibility IN ('public','unlisted')) IS 1`),
	check("content_documents_qa_state_check", sql`kind <> 'qa' OR row_role <> 'root' OR ((status IN ('published','hidden')) IS 1 AND (source IN ('manual','import','template')) IS 1)`),
	check("content_documents_qa_counts_check", sql`kind <> 'qa' OR row_role <> 'root' OR ((json_type(metadata_json, '$.is_owner_answer') = 'integer' AND json_type(metadata_json, '$.upvote_count') = 'integer') IS 1)`),
	check("content_documents_copy_required_check", sql`row_role <> 'root' OR ((kind NOT IN ('page','article','qa') OR title IS NOT NULL) AND (kind <> 'article' OR slug IS NOT NULL) AND (kind <> 'social_post' OR summary IS NOT NULL))`),
	check("content_documents_article_tags_check", sql`kind <> 'article' OR json_type(metadata_json, '$.tags') IS NULL OR json_type(metadata_json, '$.tags') IN ('array','null')`),
	check("content_documents_social_source_check", sql`kind <> 'social_post' OR row_role <> 'root' OR (source IN ('manual','template')) IS 1`),
	check("content_documents_social_post_type_check", sql`(kind <> 'social_post' OR row_role <> 'root' OR ((metadata_json ->> '$.post_type') IN ('standard', 'offer', 'event', 'alert'))) IS 1`),
	check("content_documents_social_event_json_check", sql`kind <> 'social_post' OR row_role <> 'root' OR ((metadata_json ->> '$.event') IS NULL OR (json_valid((metadata_json ->> '$.event')) AND json_type((metadata_json ->> '$.event')) IS 'object' AND json_type((metadata_json ->> '$.event'), '$.title') IS 'text' AND length(trim(json_extract((metadata_json ->> '$.event'), '$.title'))) > 0 AND json_type((metadata_json ->> '$.event'), '$.schedule') IS 'object' AND json_type((metadata_json ->> '$.event'), '$.schedule.start_date') IS 'text' AND json_type((metadata_json ->> '$.event'), '$.schedule.start_time') IS 'text' AND json_type((metadata_json ->> '$.event'), '$.schedule.end_date') IS 'text' AND json_type((metadata_json ->> '$.event'), '$.schedule.end_time') IS 'text'))`),
	check("content_documents_social_offer_json_check", sql`kind <> 'social_post' OR row_role <> 'root' OR ((metadata_json ->> '$.offer') IS NULL OR (json_valid((metadata_json ->> '$.offer')) AND json_type((metadata_json ->> '$.offer')) IS 'object'))`),
	check("content_documents_social_call_to_action_check", sql`kind <> 'social_post' OR row_role <> 'root' OR ((metadata_json ->> '$.call_to_action') IS NULL OR (json_valid((metadata_json ->> '$.call_to_action')) AND json_type((metadata_json ->> '$.call_to_action')) IS 'object' AND (json_extract((metadata_json ->> '$.call_to_action'), '$.action_type') IN ('book', 'order', 'shop', 'learn_more', 'sign_up', 'call')) IS 1 AND ((json_extract((metadata_json ->> '$.call_to_action'), '$.action_type') = 'call' AND json_type((metadata_json ->> '$.call_to_action'), '$.url') IS NULL) OR (json_extract((metadata_json ->> '$.call_to_action'), '$.action_type') <> 'call' AND json_type((metadata_json ->> '$.call_to_action'), '$.url') IS 'text' AND length(trim(json_extract((metadata_json ->> '$.call_to_action'), '$.url'))) > 0))))`),
	check("content_documents_social_topic_shape_check", sql`(kind <> 'social_post' OR row_role <> 'root' OR (((metadata_json ->> '$.post_type') = 'standard' AND (metadata_json ->> '$.event') IS NULL AND (metadata_json ->> '$.offer') IS NULL AND (metadata_json ->> '$.alert_type') IS NULL) OR ((metadata_json ->> '$.post_type') = 'event' AND (metadata_json ->> '$.event') IS NOT NULL AND (metadata_json ->> '$.offer') IS NULL AND (metadata_json ->> '$.alert_type') IS NULL) OR ((metadata_json ->> '$.post_type') = 'offer' AND (metadata_json ->> '$.event') IS NOT NULL AND (metadata_json ->> '$.offer') IS NOT NULL AND (metadata_json ->> '$.call_to_action') IS NULL AND (metadata_json ->> '$.alert_type') IS NULL) OR ((metadata_json ->> '$.post_type') = 'alert' AND (metadata_json ->> '$.event') IS NULL AND (metadata_json ->> '$.offer') IS NULL AND (metadata_json ->> '$.alert_type') IS 'covid_19'))) IS 1`),
	check("content_documents_channel_facebook_check", sql`kind <> 'social_post' OR row_role <> 'root' OR (json_type(metadata_json, '$.channels.facebook') IS NULL OR (json_type(metadata_json, '$.channels.facebook') IS 'object' AND json_type(metadata_json, '$.channels.facebook.created_at') IS 'text' AND (((metadata_json ->> '$.channels.facebook.status') = 'pending' AND (metadata_json ->> '$.channels.facebook.provider_post_id') IS NULL AND (metadata_json ->> '$.channels.facebook.published_at') IS NULL AND (metadata_json ->> '$.channels.facebook.error_message') IS NULL) OR ((metadata_json ->> '$.channels.facebook.status') = 'published' AND (metadata_json ->> '$.channels.facebook.provider_post_id') IS NOT NULL AND (metadata_json ->> '$.channels.facebook.published_at') IS NOT NULL AND (metadata_json ->> '$.channels.facebook.error_message') IS NULL) OR ((metadata_json ->> '$.channels.facebook.status') IN ('failed','skipped') AND (metadata_json ->> '$.channels.facebook.provider_post_id') IS NULL AND (metadata_json ->> '$.channels.facebook.published_at') IS NULL AND (metadata_json ->> '$.channels.facebook.error_message') IS NOT NULL))) IS 1)`),
	check("content_documents_channel_instagram_check", sql`kind <> 'social_post' OR row_role <> 'root' OR (json_type(metadata_json, '$.channels.instagram') IS NULL OR (json_type(metadata_json, '$.channels.instagram') IS 'object' AND json_type(metadata_json, '$.channels.instagram.created_at') IS 'text' AND (((metadata_json ->> '$.channels.instagram.status') = 'pending' AND (metadata_json ->> '$.channels.instagram.provider_post_id') IS NULL AND (metadata_json ->> '$.channels.instagram.published_at') IS NULL AND (metadata_json ->> '$.channels.instagram.error_message') IS NULL) OR ((metadata_json ->> '$.channels.instagram.status') = 'published' AND (metadata_json ->> '$.channels.instagram.provider_post_id') IS NOT NULL AND (metadata_json ->> '$.channels.instagram.published_at') IS NOT NULL AND (metadata_json ->> '$.channels.instagram.error_message') IS NULL) OR ((metadata_json ->> '$.channels.instagram.status') IN ('failed','skipped') AND (metadata_json ->> '$.channels.instagram.provider_post_id') IS NULL AND (metadata_json ->> '$.channels.instagram.published_at') IS NULL AND (metadata_json ->> '$.channels.instagram.error_message') IS NOT NULL))) IS 1)`),
]);

export const resource_localizations = sqliteTable("resource_localizations", {
	id: text().primaryKey(),
	organization_id: text().notNull(),
	site_id: text().notNull(),
	resource_type: text().notNull(),
	resource_id: text().notNull(),
	locale: text().notNull(),
	values_json: text().notNull(),
	route_path: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by_user_id: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by_user_id: text().notNull(),
}, (table) => [
	check("resource_localizations_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	foreignKey({
		columns: [table.organization_id, table.site_id, table.locale],
		foreignColumns: [site_locales.organization_id, site_locales.site_id, site_locales.locale],
		name: "resource_localizations_site_locale_fk",
	}).onDelete("cascade"),
	unique("resource_localizations_org_site_resource_locale_unique").on(
		table.organization_id,
		table.site_id,
		table.resource_type,
		table.resource_id,
		table.locale,
	),
	uniqueIndex("resource_localizations_site_locale_route_unique")
		.on(table.site_id, table.locale, table.route_path)
		.where(sql`route_path IS NOT NULL`),
	check("resource_localizations_values_json_check", sql`json_valid(values_json) AND json_type(values_json) = 'object'`),
	check("resource_localizations_non_english_check", sql`locale <> 'en'`),
	check("resource_localizations_route_path_check", sql`route_path IS NULL OR (route_path LIKE '/' || locale || '/%' AND route_path NOT LIKE '%?%' AND route_path NOT LIKE '%#%' AND route_path NOT LIKE '%//%')`),
	index("resource_localizations_site_locale_type_idx").on(table.site_id, table.locale, table.resource_type),
	index("resource_localizations_resource_idx").on(table.resource_type, table.resource_id),
]);

export const content_blocks = sqliteTable("content_blocks", {
	id: text().primaryKey(),
	source_block_id: text(),
	document_id: text().notNull().references(() => content_documents.id, { onDelete: "cascade" } ),
	parent_block_id: text(),
	type: text().notNull(),
	position: integer().default(0).notNull(),
	level: integer(),
	data_json: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("content_blocks_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
	index("content_blocks_document_position_idx").on(table.document_id, table.position),
	foreignKey({ columns: [table.source_block_id], foreignColumns: [table.id], name: "content_blocks_source_fk" }).onDelete("cascade"),
	uniqueIndex("content_blocks_document_source_unique").on(table.document_id, table.source_block_id).where(sql`source_block_id IS NOT NULL`),
	check("content_blocks_source_check", sql`source_block_id IS NULL OR source_block_id <> id`),
	index("content_blocks_parent_idx").on(table.parent_block_id),
	unique("content_blocks_document_id_unique").on(table.document_id, table.id),
	foreignKey({ columns: [table.document_id, table.parent_block_id], foreignColumns: [table.document_id, table.id], name: "content_blocks_parent_document_fk" }).onDelete("cascade"),
	check("content_blocks_data_json_check", sql`json_valid(data_json) AND json_type(data_json) IS 'object'`),
	check("content_blocks_parent_check", sql`parent_block_id IS NULL OR parent_block_id <> id`),
	check("content_blocks_position_check", sql`position >= 0`),
	check("content_blocks_level_check", sql`level IS NULL OR level BETWEEN 1 AND 6`),
]);

export const public_resource_cache_invalidations = sqliteTable("public_resource_cache_invalidations", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	reason: text().notNull(),
	status: text().default("pending").notNull(),
	attempt_count: integer().default(0).notNull(),
	claimed_at: text(),
	processed_at: text(),
	last_error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("public_resource_cache_invalidations_instants_check", sql`(claimed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', claimed_at, '+0 days') IS claimed_at) AND (processed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', processed_at, '+0 days') IS processed_at) AND (created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
	index("public_resource_cache_invalidations_status_idx").on(table.status, table.created_at),
	index("public_resource_cache_invalidations_site_idx").on(table.site_id, table.status),
	check("public_resource_cache_invalidations_attempt_count_check", sql`attempt_count >= 0`),
]);

export const analytics_events = sqliteTable("analytics_events", {
  id: text().primaryKey(),
  kind: text({ enum: ["pageview", "conversion"] }).notNull(),
  organization_id: text().references(() => organization.id, { onDelete: "cascade" }),
  site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
  location_id: text().references(() => business_locations.id, { onDelete: "set null" }),
  session_id: text(),
  visitor_id: text(),
  page_path: text(),
  duration_seconds: integer(),
  payload_json: text().notNull(),
  created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, table => [
	check("analytics_events_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at)`),
  foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "analytics_events_site_scope_fk" }).onDelete("cascade"),
  check("analytics_events_payload_check", sql`json_valid(payload_json) AND json_type(payload_json) IS 'object'`),
  check("analytics_events_shape_check", sql`(kind = 'pageview' AND page_path IS NOT NULL) OR (kind = 'conversion' AND organization_id IS NOT NULL AND session_id IS NOT NULL AND visitor_id IS NOT NULL AND duration_seconds IS NULL
    AND json_type(payload_json, '$.event_name') IS 'text' AND length(payload_json ->> '$.event_name') BETWEEN 1 AND 64
    AND (payload_json ->> '$.event_name') GLOB '[a-z]*' AND (payload_json ->> '$.event_name') NOT GLOB '*[^a-z0-9_]*'
    AND json_type(payload_json, '$.stage') IS 'text' AND (payload_json ->> '$.stage') IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff')
    AND json_type(payload_json, '$.attribution.source') IS 'text' AND json_type(payload_json, '$.attribution.medium') IS 'text'
    AND json_type(payload_json, '$.attributed_at') IS 'text')`),
  index("analytics_events_site_kind_created_idx").on(table.site_id, table.kind, table.created_at),
  index("analytics_events_site_session_idx").on(table.site_id, table.kind, table.session_id),
  index("analytics_events_site_visitor_idx").on(table.site_id, table.kind, table.visitor_id),
  index("analytics_events_conversion_name_idx").on(table.kind, sql`(payload_json ->> '$.event_name')`, table.created_at),
  index("analytics_events_conversion_entity_idx").on(table.site_id, sql`(payload_json ->> '$.entity_type')`, sql`(payload_json ->> '$.entity_id')`).where(sql`kind = 'conversion'`),
  uniqueIndex("analytics_events_conversion_entity_unique").on(table.site_id, sql`(payload_json ->> '$.event_name')`, sql`(payload_json ->> '$.entity_type')`, sql`(payload_json ->> '$.entity_id')`).where(sql`kind = 'conversion' AND (payload_json ->> '$.entity_type') IS NOT NULL AND (payload_json ->> '$.entity_id') IS NOT NULL AND (payload_json ->> '$.event_name') IN ('contact_submit', 'reservation_submit', 'booking_submit')`),
]);

export const analytics_summaries = sqliteTable("analytics_summaries", {
  id: text().primaryKey(),
  kind: text({ enum: ["session", "site_day", "page_day", "dimension_day"] }).notNull(),
  organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
  site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
  date: text().notNull(),
  key: text().notNull(),
  payload_json: text().notNull(),
  created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
  updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, table => [
	check("analytics_summaries_instants_check", sql`(created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)`),
  foreignKey({ columns: [table.organization_id, table.site_id], foreignColumns: [sites.organization_id, sites.id], name: "analytics_summaries_site_scope_fk" }).onDelete("cascade"),
  check("analytics_summaries_payload_check", sql`json_valid(payload_json) AND json_type(payload_json) IS 'object'`),
  check("analytics_summaries_scope_check", sql`(kind = 'session' AND date = ''
    AND json_type(payload_json, '$.visitor_id') IS 'text' AND json_type(payload_json, '$.started_at') IS 'text'
    AND json_type(payload_json, '$.last_seen_at') IS 'text' AND json_type(payload_json, '$.landing_path') IS 'text'
    AND json_type(payload_json, '$.attribution.source') IS 'text' AND json_type(payload_json, '$.attribution.medium') IS 'text'
    AND json_type(payload_json, '$.duration_seconds') IS 'integer' AND (payload_json ->> '$.duration_seconds') >= 0)
    OR (kind != 'session' AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND json_type(payload_json, '$.page_views') IS 'integer' AND (payload_json ->> '$.page_views') >= 0)`),
  check("analytics_summaries_day_metrics_check", sql`kind != 'site_day' OR (key = ''
    AND json_type(payload_json, '$.unique_sessions') IS 'integer' AND (payload_json ->> '$.unique_sessions') >= 0
    AND json_type(payload_json, '$.unique_visitors') IS 'integer' AND (payload_json ->> '$.unique_visitors') >= 0
    AND json_type(payload_json, '$.returning_visitors') IS 'integer' AND (payload_json ->> '$.returning_visitors') >= 0
    AND json_type(payload_json, '$.avg_session_duration') IN ('integer', 'real') AND (payload_json ->> '$.avg_session_duration') >= 0
    AND json_type(payload_json, '$.pages_per_session') IN ('integer', 'real') AND (payload_json ->> '$.pages_per_session') >= 0
    AND json_type(payload_json, '$.avg_session_duration') IS NOT NULL AND json_type(payload_json, '$.pages_per_session') IS NOT NULL)`),
  check("analytics_summaries_dimension_key_check", sql`kind != 'dimension_day' OR (json_valid(key) AND json_type(key) IS 'array' AND json_array_length(key) = 3
    AND json_type(key, '$[0]') IS 'text' AND (key ->> '$[0]') IN ('country', 'city', 'device', 'referrer')
    AND json_type(key, '$[1]') IS 'text' AND json_type(key, '$[2]') IS 'text')`),
  uniqueIndex("analytics_summaries_grain_unique").on(table.site_id, table.kind, table.date, table.key),
  index("analytics_summaries_session_started_idx").on(table.site_id, sql`(payload_json ->> '$.started_at')`).where(sql`kind = 'session'`),
  index("analytics_summaries_session_seen_idx").on(table.site_id, sql`(payload_json ->> '$.last_seen_at')`).where(sql`kind = 'session'`),
  index("analytics_summaries_session_visitor_idx").on(table.site_id, sql`(payload_json ->> '$.visitor_id')`, sql`(payload_json ->> '$.started_at')`).where(sql`kind = 'session'`),
]);

