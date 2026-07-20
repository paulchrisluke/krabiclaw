import { sql } from "drizzle-orm"
import { sqliteTable, integer, text, numeric, real, unique, primaryKey, uniqueIndex, index, check } from "drizzle-orm/sqlite-core"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"

export const account = sqliteTable("account", {
	id: text().primaryKey(),
	accountId: text().notNull(),
	providerId: text().notNull(),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	expiresAt: integer({ mode: "timestamp" }),
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
	marketing_opted_out_at: text(),
	loyalty_points_balance: integer().default(0).notNull(),
	last_booking_at: text(),
	last_review_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_customers_site_email_normalized_unique").on(table.site_id, table.email_normalized).where(sql`email_normalized IS NOT NULL`),
	uniqueIndex("idx_customers_stripe_customer_id_unique").on(table.stripe_customer_id).where(sql`stripe_customer_id IS NOT NULL`),
	index("idx_customers_organization_id").on(table.organization_id),
	index("idx_customers_site_id").on(table.site_id),
	index("idx_customers_org_site_email_hash").on(table.organization_id, table.site_id, table.email_hash),
	index("idx_customers_user_id").on(table.user_id),
	check("customers_source_check", sql`source IN ('reservation', 'experience_booking', 'review_request', 'manual', 'stripe', 'import')`),
	check("customers_status_check", sql`status IN ('active', 'merged', 'suppressed', 'deleted')`),
]);

// A guest (end-customer) user's request to link their Better Auth account to an
// existing tenant-scoped `customers` row discovered by verified email match.
// Never created/verified silently — see docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
// One row per (customer_id, user_id) pair; `token_hash` + `token_expires_at` back a
// single-use claim-verification email distinct from Better Auth's own signup
// verification email, so proving mailbox ownership at signup time never by itself
// grants access to someone else's booking history.
export const customer_claims = sqliteTable("customer_claims", {
	id: text().primaryKey(),
	customer_id: text().notNull().references(() => customers.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	email_at_claim: text().notNull(),
	status: text().default("pending").notNull(),
	token_hash: text(),
	token_expires_at: integer({ mode: "timestamp_ms" }),
	verified_at: integer({ mode: "timestamp_ms" }),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_customer_claims_customer_user_unique").on(table.customer_id, table.user_id),
	index("idx_customer_claims_user_id").on(table.user_id),
	index("idx_customer_claims_customer_id").on(table.customer_id),
	index("idx_customer_claims_token_hash").on(table.token_hash),
	check("customer_claims_status_check", sql`status IN ('pending', 'verified', 'expired', 'rejected')`),
]);

export const ai_credits = sqliteTable("ai_credits", {
	organization_id: text().primaryKey().references(() => organization.id, { onDelete: "cascade" } ),
	balance: integer().default(0).notNull(),
	lifetime_used: integer().default(0).notNull(),
	last_topped_up_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const ai_usage_log = sqliteTable("ai_usage_log", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	action: text().notNull(),
	model: text().notNull(),
	input_tokens: integer().default(0).notNull(),
	output_tokens: integer().default(0).notNull(),
	credits_charged: integer().default(0).notNull(),
	cf_gateway_log_id: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	// WHERE organization_id = ? on /api/billing/credits.get.ts (customer-facing usage/credits page).
	index("ai_usage_log_organization_id_idx").on(table.organization_id),
]);

export const business_location_translations = sqliteTable("business_location_translations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	title: text(),
	address: text(),
	city: text(),
	description: text(),
	short_description: text(),
	status: text().default("draft").notNull(),
	source_hash: text(),
	translated_at: text(),
	reviewed_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("business_location_translations_organization_id_site_id_location_id_locale_unique").on(table.organization_id, table.site_id, table.location_id, table.locale),
]);

export const business_locations = sqliteTable("business_locations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	slug: text().notNull(),
	google_location_id: text(),
	google_connection_id: text().references((): AnySQLiteColumn => google_business_connections.id, { onDelete: "set null" } ),
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
	is_primary: numeric().default(sql`false`),
	status: text().default("active"),
	last_synced_at: text(),
	description: text(),
	short_description: text(),
	description_provenance: text(),
	special_hours: text(),
	price_level: text(),
	attributes: text(),
	email: text(),
	facebook_url: text(),
	facebook_page_id: text(),
	facebook_connection_id: text().references(() => facebook_pages_connections.id, { onDelete: "set null" } ),
	instagram_url: text(),
	tiktok_url: text(),
	grab_url: text(),
	uber_eats_url: text(),
	foodpanda_url: text(),
	google_place_id: text(),
	google_review_url: text(),
	hero_image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	hero_video_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	notification_phone: text(),
	timezone: text(),
	max_capacity: integer(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	og_image_asset_id: text().references((): AnySQLiteColumn => media_assets.id, { onDelete: "set null" } ),
}, (table) => [
	unique("business_locations_organization_id_site_id_slug_unique").on(table.organization_id, table.site_id, table.slug),
]);

export const canary_runs = sqliteTable("canary_runs", {
	id: text().primaryKey(),
	run_type: text().notNull(),
	environment: text().default("production").notNull(),
	status: text().notNull(),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	details_json: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const chowbot_channel_state = sqliteTable("chowbot_channel_state", {
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	channel: text().notNull(),
	selected_site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	active_conversation_id: text().references(() => chowbot_conversations.id, { onDelete: "set null" } ),
	pending_media: text(),
	pending_confirmation: text(),
	last_inbound_id: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("chowbot_channel_state_user_id_idx").on(table.user_id),
]);

export const chowbot_conversations = sqliteTable("chowbot_conversations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	title: text().default("New Conversation").notNull(),
	active_channel: text().default("dashboard").notNull(),
	status: text().default("active").notNull(),
	selected_location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("chowbot_conversations_org_site_idx").on(table.organization_id, table.site_id),
	index("chowbot_conversations_user_id_idx").on(table.user_id),
]);

export const chowbot_messages = sqliteTable("chowbot_messages", {
	id: text().primaryKey(),
	conversation_id: text().notNull().references(() => chowbot_conversations.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	user_id: text().references(() => user.id, { onDelete: "set null" } ),
	role: text().notNull(),
	channel: text().notNull(),
	content: text(),
	media: text(),
	meta_message_id: text().unique(),
	tool_calls: text(),
	status: text().default("sent").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("chowbot_messages_conversation_id_idx").on(table.conversation_id),
	index("chowbot_messages_org_site_idx").on(table.organization_id, table.site_id),
]);

export const contact_submissions = sqliteTable("contact_submissions", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	email: text().notNull(),
	subject: text(),
	message: text().notNull(),
	consent_at: text(),
	status: text().default("new").notNull(),
	ip_hash: text(),
	experience_id: text().references(() => experiences.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("contact_submissions_org_site_idx").on(table.organization_id, table.site_id),
]);

export const guest_threads = sqliteTable("guest_threads", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	submission_type: text().notNull(),
	submission_id: text().notNull(),
	guest_name: text().notNull(),
	guest_email: text(),
	guest_phone: text(),
	inbox_status: text().default("open").notNull(),
	unread_count: integer().default(0).notNull(),
	last_message_at: text(),
	last_inbound_at: text(),
	last_outbound_at: text(),
	last_message_preview: text(),
	owner_last_seen_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("guest_threads_submission_unique").on(table.submission_type, table.submission_id),
	index("guest_threads_site_updated_idx").on(table.site_id, table.updated_at),
	index("guest_threads_location_updated_idx").on(table.location_id, table.updated_at),
	index("guest_threads_inbox_status_idx").on(table.site_id, table.inbox_status, table.updated_at),
	check("guest_threads_submission_type_check", sql`submission_type IN ('contact', 'reservation', 'experience_booking')`),
	check("guest_threads_inbox_status_check", sql`inbox_status IN ('open', 'waiting_on_owner', 'waiting_on_guest', 'closed')`),
	index("guest_threads_organization_id_idx").on(table.organization_id),
]);

export const submission_messages = sqliteTable("submission_messages", {
	id: text().primaryKey(),
	thread_id: text().references(() => guest_threads.id, { onDelete: "cascade" } ),
	submission_type: text().notNull(), // 'contact' | 'reservation' | 'experience_booking'
	submission_id: text().notNull(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	direction: text().notNull(), // 'out' | 'in'
	channel: text().notNull(), // 'email' | 'whatsapp'
	body: text().notNull(),
	sender_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	meta_message_id: text().unique(),
	status: text().default("sent").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("submission_type_check", sql`submission_type IN ('contact', 'reservation', 'experience_booking')`),
	check("direction_check", sql`direction IN ('in', 'out')`),
	check("channel_check", sql`channel IN ('email', 'whatsapp')`),
	index("submission_type_id_idx").on(table.submission_type, table.submission_id),
	index("submission_messages_thread_created_idx").on(table.thread_id, table.created_at),
	index("submission_messages_org_site_idx").on(table.organization_id, table.site_id),
]);

export const notification_events = sqliteTable("notification_events", {
	id: text().primaryKey(),
	scope_type: text().notNull(),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	submission_type: text().notNull(),
	submission_id: text().notNull(),
	event_type: text().notNull(),
	channels: text(),
	recipients: text(),
	payload: text(),
	status: text().default("pending").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("notification_events_scope_created_idx").on(table.scope_type, table.created_at),
	index("notification_events_submission_idx").on(table.submission_type, table.submission_id),
	index("notification_events_event_created_idx").on(table.event_type, table.created_at),
	index("notification_events_org_site_idx").on(table.organization_id, table.site_id),
]);

export const dashboard_preferences = sqliteTable("dashboard_preferences", {
	id: text().primaryKey(),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	selected_location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
	unique("dashboard_preferences_user_id_organization_id_unique").on(table.user_id, table.organization_id),
]);

export const domain_reconciliation_jobs = sqliteTable("domain_reconciliation_jobs", {
	id: text().primaryKey(),
	domain_id: text().notNull().references(() => site_domains.id, { onDelete: "cascade" } ).unique(),
	status: text().default("queued").notNull(),
	run_after: text().notNull(),
	attempts: integer().default(0).notNull(),
	last_error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const experience_bookings = sqliteTable("experience_bookings", {
	id: text().primaryKey(),
	experience_id: text().notNull().references(() => experiences.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	customer_id: text().references(() => customers.id, { onDelete: "set null" } ),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	guest_name: text().notNull(),
	guest_email: text().notNull(),
	guest_phone: text(),
	party_size: integer().default(1).notNull(),
	booking_date: text().notNull(),
	time_slot: text().notNull(),
	status: text().default("pending").notNull(),
	notes: text(),
	ip_hash: text(),
	cancellation_token_hash: text(),
	cancellation_token_expires_at: text(),
	cancellation_token_used_at: text(),
	completed_at: text(),
	completion_source: text(),
	review_request_sent_at: text(),
	review_reminder_sent_at: text(),
	review_submitted_at: text(),
	review_id: text().references(() => reviews.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("idx_experience_bookings_customer_id").on(table.customer_id),
	index("idx_experience_bookings_review_request_due").on(table.site_id, table.status, table.completed_at, table.review_request_sent_at),
	index("idx_experience_bookings_review_reminder_due").on(table.site_id, table.review_request_sent_at, table.review_reminder_sent_at, table.review_submitted_at),
	check("experience_bookings_completion_source_check", sql`completion_source IS NULL OR completion_source IN ('manual', 'auto')`),
	index("experience_bookings_organization_id_idx").on(table.organization_id),
]);

export const experience_slot_overrides = sqliteTable("experience_slot_overrides", {
	id: text().primaryKey(),
	experience_id: text().notNull().references(() => experiences.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	override_date: text().notNull(),
	time_slot: text().notNull(),
	status: text().default("closed").notNull(),
	capacity_override: integer(),
	note: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text(),
}, (table) => [
	index("experience_slot_overrides_org_site_idx").on(table.organization_id, table.site_id),
]);

export const facebook_pages_connections = sqliteTable("facebook_pages_connections", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	connected_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	facebook_user_id: text().notNull(),
	facebook_page_id: text(),
	facebook_page_name: text(),
	encrypted_user_token: text().notNull(),
	encrypted_page_token: text(),
	user_token_expires_at: text(),
	scopes: text(),
	status: text().default("active").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("facebook_pages_connections_organization_id_site_id_unique").on(table.organization_id, table.site_id),
]);

export const google_business_connections = sqliteTable("google_business_connections", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references((): AnySQLiteColumn => business_locations.id, { onDelete: "set null" } ),
	connected_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	provider_account_email: text().notNull(),
	encrypted_access_token: text().notNull(),
	encrypted_refresh_token: text().notNull(),
	scopes: text().notNull(),
	expires_at: text(),
	status: text().default("active").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("google_business_connections_organization_id_site_id_location_id_unique").on(table.organization_id, table.site_id, table.location_id),
	uniqueIndex("idx_google_business_connections_site_level_unique").on(table.organization_id, table.site_id).where(sql`location_id IS NULL`),
]);

export const google_business_events = sqliteTable("google_business_events", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "cascade" } ),
	google_location_id: text(),
	event_type: text(),
	payload: text(),
	status: text().default("pending").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const google_place_snapshots = sqliteTable("google_place_snapshots", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	place_id: text().notNull(),
	source_url: text(),
	snapshot_json: text().notNull(),
	fetched_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const invitation = sqliteTable("invitation", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	email: text().notNull(),
	role: text(),
	status: text().default("pending").notNull(),
	expiresAt: integer({ mode: "timestamp" }).notNull(),
	inviterId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	index("invitation_organizationId_idx").on(table.organizationId),
	uniqueIndex("idx_invitation_org_pending_owner").on(table.organizationId).where(sql`role = 'owner' AND status = 'pending'`),
	uniqueIndex("idx_invitation_org_email_pending_unique").on(table.organizationId, sql`lower(${table.email})`).where(sql`status = 'pending'`),
]);

export const invitation_access_scope = sqliteTable("invitation_access_scope", {
	id: text().primaryKey(),
	invitation_id: text().notNull().references(() => invitation.id, { onDelete: "cascade" }),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" }),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_invitation_access_scope_unique").on(table.invitation_id, table.site_id, table.location_id),
	uniqueIndex("idx_invitation_access_scope_site_unique").on(table.invitation_id, table.site_id).where(sql`location_id IS NULL`),
	index("idx_invitation_access_scope_invitation_id").on(table.invitation_id),
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

export const location_qa = sqliteTable("location_qa", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	page_path: text(),
	google_question_id: text(),
	question: text().notNull(),
	question_author: text(),
	question_date: text(),
	answer: text(),
	answer_author: text(),
	answer_date: text(),
	is_owner_answer: integer().default(0).notNull(),
	upvote_count: integer().default(0).notNull(),
	source: text().default("manual").notNull(),
	status: text().default("published").notNull(),
	sort_order: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_location_qa_google_id").on(table.google_question_id).where(sql`google_question_id IS NOT NULL`),
	index("idx_location_qa_location").on(table.location_id, table.status, table.sort_order),
	index("idx_location_qa_site").on(table.site_id, table.status, table.sort_order).where(sql`location_id IS NULL`),
	index("idx_location_qa_page").on(table.site_id, table.page_path, table.status, table.sort_order).where(sql`location_id IS NULL AND page_path IS NOT NULL`),
	check("location_qa_scope_check", sql`location_id IS NULL OR page_path IS NULL`),
	check("location_qa_page_path_check", sql`page_path IS NULL OR page_path LIKE '/%'`),
	check("location_qa_source_check", sql`source IN ('gmb','google_maps','manual','llm_generated','manual_override','template','import')`),
	check("location_qa_status_check", sql`status IN ('published','hidden')`),
	index("location_qa_organization_id_idx").on(table.organization_id),
]);

export const media_assets = sqliteTable("media_assets", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references((): AnySQLiteColumn => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	kind: text().notNull(),
	provider: text().notNull(),
	source: text().notNull(),
	cloudflare_image_id: text(),
	r2_key: text(),
	google_media_name: text(),
	public_url: text(),
	thumbnail_url: text(),
	mime_type: text(),
	file_name: text(),
	file_size: integer(),
	width: integer(),
	height: integer(),
	duration: integer(),
	alt_text: text(),
	category: text().$type<'exterior' | 'interior' | 'food' | 'menu' | 'team' | 'other' | 'logo' | 'blog'>(),
	status: text().default("active").notNull(),
	created_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	delete_pending_at: text(),
	// No Drizzle index() here: idx_media_assets_site (site_id, status, created_at DESC) and
	// idx_media_assets_location (location_id, status, created_at DESC WHERE location_id IS NOT
	// NULL) already cover this table's real query patterns - they were hand-authored in the
	// immutable migrations/0001_initial.sql (pre-dates schema.ts as source of truth) and were
	// never mirrored back here. organization_id adds no separate selectivity once site_id is
	// fixed (a site belongs to exactly one org), so no additional index is needed.
}, () => [
	check("media_assets_category_check", sql`category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')`),
]);

export const media_assets_old = sqliteTable("media_assets_old", {
	id: text().primaryKey(),
	organization_id: text().notNull(),
	site_id: text().notNull(),
	location_id: text(),
	kind: text().notNull(),
	provider: text().notNull(),
	source: text().notNull(),
	cloudflare_image_id: text(),
	r2_key: text(),
	google_media_name: text(),
	public_url: text(),
	thumbnail_url: text(),
	mime_type: text(),
	file_name: text(),
	file_size: integer(),
	width: integer(),
	height: integer(),
	duration: integer(),
	alt_text: text(),
	category: text(),
	status: text().default("active").notNull(),
	created_by_user_id: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const member = sqliteTable("member", {
	id: text().primaryKey(),
	organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	userId: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	role: text().default("member").notNull(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	// WHERE m.userId = ? is the primary access-check predicate on nearly every authenticated
	// dashboard/MCP request (getDashboardContext, listAccessibleSitesForMcp, requireMcpSite).
	// Without this, D1 full-scans member on every single request - confirmed via wrangler d1
	// insights as the largest rows-read driver post-cron-fix (66.9M rows / 9,778 executions on
	// one query alone). organizationId is included second so the same index also serves the
	// m.organizationId join condition in those same queries.
	index("member_userId_organizationId_idx").on(table.userId, table.organizationId),
	index("member_organizationId_idx").on(table.organizationId),
]);

export const member_access_scope = sqliteTable("member_access_scope", {
	id: text().primaryKey(),
	member_id: text().notNull().references(() => member.id, { onDelete: "cascade" }),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" }),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_member_access_scope_unique").on(table.member_id, table.site_id, table.location_id),
	uniqueIndex("idx_member_access_scope_site_unique").on(table.member_id, table.site_id).where(sql`location_id IS NULL`),
	index("idx_member_access_scope_member_id").on(table.member_id),
	index("idx_member_access_scope_resource").on(table.organization_id, table.site_id, table.location_id),
]);

export const menu_item_translations = sqliteTable("menu_item_translations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	menu_item_id: text().notNull().references(() => menu_items.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	section: text(),
	name: text(),
	description: text(),
	allergens: text(),
	ingredients: text(),
	dietary_notes: text(),
	preparation: text(),
	serving_note: text(),
	status: text().default("draft").notNull(),
	source_hash: text(),
	translated_at: text(),
	reviewed_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("menu_item_translations_organization_id_site_id_menu_item_id_locale_unique").on(table.organization_id, table.site_id, table.menu_item_id, table.locale),
	index("menu_item_translations_menu_item_id_idx").on(table.menu_item_id),
]);

export const menu_items = sqliteTable("menu_items", {
	id: text().primaryKey(),
	menu_id: text().notNull().references(() => menus.id, { onDelete: "cascade" } ),
	section: text().notNull(),
	name: text().notNull(),
	slug: text().default("").notNull(),
	description: text(),
	price_amount: numeric(),
	compare_at_price_amount: numeric(),
	sale_starts_at: text(),
	sale_ends_at: text(),
	image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	available: numeric().default(sql`1`).notNull(),
	featured: numeric().default(sql`false`).notNull(),
	featured_sort_order: integer().default(0).notNull(),
	sort_order: integer().default(0).notNull(),
	allergens: text(),
	ingredients: text(),
	dietary_notes: text(),
	preparation: text(),
	serving_note: text(),
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text(),
	updated_by: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	og_image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
}, (table) => [
	check("menu_items_source_check", sql`source IN ('manual', 'template')`),
	index("menu_items_menu_id_idx").on(table.menu_id),
]);

export const menu_translations = sqliteTable("menu_translations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	menu_id: text().notNull().references(() => menus.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	name: text(),
	description: text(),
	section_order: text(),
	status: text().default("draft").notNull(),
	source_hash: text(),
	translated_at: text(),
	reviewed_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("menu_translations_organization_id_site_id_menu_id_locale_unique").on(table.organization_id, table.site_id, table.menu_id, table.locale),
	index("menu_translations_menu_id_idx").on(table.menu_id),
]);

export const menus = sqliteTable("menus", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	description: text(),
	status: text().default("draft").notNull(),
	section_order: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text(),
	updated_by: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
}, (table) => [
	// getMenus() filters WHERE organization_id = ? AND site_id = ? on every editor menu-page
	// load. Confirmed via wrangler d1 insights as a top rows-read query (9.8M rows / 4,355
	// executions) - without an index this table is fully scanned per call.
	index("menus_organization_id_site_id_idx").on(table.organization_id, table.site_id),
]);

export const notifications = sqliteTable("notifications", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	scope: text().default("organization").notNull(),
	event_type: text(),
	severity: text().default("info").notNull(),
	actor_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	target_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	deep_link: text(),
	message: text(),
	channel: text().default("dashboard").notNull(),
	template: text().notNull(),
	recipient: text(),
	title: text(),
	payload: text(),
	status: text().default("pending").notNull(),
	provider_message_id: text(),
	error: text(),
	read_at: text(),
	sent_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	// Resolves a WhatsApp quoted reply's context.id back to the guest thread it
	// originated from (see docs/plan for issue #293's reply-routing contract).
	related_submission_type: text(),
	related_submission_id: text(),
	// Meta Cloud API delivery status ingestion (value.statuses[]), kept separate
	// from `status` (our own send-attempt lifecycle) since Meta's delivery
	// lifecycle (accepted < sent < delivered < read, or failed) is a distinct,
	// out-of-order-tolerant state machine layered on top of a message we already
	// recorded as sent.
	whatsapp_delivery_status: text(),
	whatsapp_delivery_error: text(),
}, (table) => [
	index("notifications_scope_created_at_idx").on(table.scope, table.created_at),
	index("notifications_organization_created_at_idx").on(table.organization_id, table.created_at),
	index("notifications_site_created_at_idx").on(table.site_id, table.created_at),
	index("notifications_target_user_created_at_idx").on(table.target_user_id, table.created_at),
	check("notifications_whatsapp_delivery_status_check", sql`whatsapp_delivery_status IS NULL OR whatsapp_delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed')`),
	check("notifications_related_submission_type_check", sql`related_submission_type IS NULL OR related_submission_type IN ('contact', 'reservation', 'experience_booking', 'invitation')`),
]);

// App-owned mirror of Better Auth's `user.phoneNumberVerified`, kept as a
// separate companion table (rather than columns bolted onto Better Auth's
// `user` table) so app-domain verification state stays independent of a
// table Better Auth migrates on its own schedule. One row per user.
export const user_phone_verification = sqliteTable("user_phone_verification", {
	id: text().primaryKey(),
	user_id: text().notNull().unique().references(() => user.id, { onDelete: "cascade" } ),
	format_valid: integer().default(0).notNull(),
	ownership_verified: integer().default(0).notNull(),
	whatsapp_observed_at: text(),
	phone_metadata_version: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("user_phone_verification_user_id_unique").on(table.user_id),
]);

export const notification_reads = sqliteTable("notification_reads", {
	notification_id: text().notNull().references(() => notifications.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	read_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.notification_id, table.user_id] }),
	index("notification_reads_user_read_at_idx").on(table.user_id, table.read_at),
]);

export const notification_deliveries = sqliteTable("notification_deliveries", {
	id: text().primaryKey(),
	notification_id: text().notNull().references(() => notifications.id, { onDelete: "cascade" } ),
	channel: text().notNull(),
	status: text().default("pending").notNull(),
	provider_message_id: text(),
	error: text(),
	sent_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("notification_deliveries_notification_idx").on(table.notification_id),
	index("notification_deliveries_channel_status_idx").on(table.channel, table.status),
]);

export const oauthAccessToken = sqliteTable("oauthAccessToken", {
	id: text().primaryKey(),
	clientId: text().notNull(),
	userId: text(),
	token: text().notNull().unique(),
	// Better Auth serializes this as JSON string[]; unlike oauthClient this table
	// has no foreign-key references pointing into it, so unlike scopesJson's
	// additive workaround there this default can be corrected directly.
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
	// Better Auth models this field as string[]. The historical `scopes`
	// column defaults to an invalid empty JSON string and cannot be altered
	// safely without rebuilding this referenced table, so auth maps its logical
	// scopes field to this additive canonical column instead.
	scopesJson: text().default("[]").notNull(),
	scopes: text().default("").notNull(),
	public: integer().default(0).notNull(),
	requirePkce: integer().default(1).notNull(),
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
	accessTokenId: text(),
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
	slug: text().unique(),
	logo: text(),
	metadata: text(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
});

export const organization_billing = sqliteTable("organization_billing", {
	id: text(),
	organization_id: text().primaryKey().references(() => organization.id, { onDelete: "cascade" } ),
	stripe_customer_id: text().unique(),
	stripe_subscription_id: text().unique(),
	stripe_subscription_item_id: text().unique(),
	status: text().default("free").notNull(),
	plan: text().default("free").notNull(),
	current_period_end: text(),
	cancel_at_period_end: numeric().default(sql`false`),
	auto_topup_enabled: integer().default(0).notNull(),
	auto_topup_bundle: integer().default(500).notNull(),
	auto_topup_threshold: integer().default(100).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const organization_entitlements = sqliteTable("organization_entitlements", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	key: text().notNull(),
	value: text(),
	source: text().default("system").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("organization_entitlements_organization_id_key_unique").on(table.organization_id, table.key),
]);

export const onboarding_drafts = sqliteTable("onboarding_drafts", {
	id: text().primaryKey(),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	name: text().notNull(),
	vertical: text().default("restaurant").notNull(),
	subdomain_candidate: text(),
	source_type: text().notNull(),
	status: text().default("active").notNull(),
	payload_json: text().notNull(),
	committed_site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	committed_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("idx_onboarding_drafts_active_user_unique").on(table.user_id).where(sql`status = 'active'`),
	check("onboarding_drafts_status_check", sql`status IN ('active', 'committing', 'committed', 'failed')`),
	index("onboarding_drafts_user_id_idx").on(table.user_id),
]);

export const platform_analytics = sqliteTable("platform_analytics", {
	id: text().primaryKey(),
	metric: text().notNull(),
	value: integer().notNull(),
	date: text().notNull(),
}, (table) => [
	unique("platform_analytics_metric_date_unique").on(table.metric, table.date),
]);

export const blog_posts = sqliteTable("blog_posts", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ), // null = platform blog post
	site_id: text().references(() => sites.id, { onDelete: "cascade" } ), // null = platform blog post
	title: text().notNull(),
	slug: text().notNull(),
	body: text().notNull(),
	excerpt: text(),
	category: text(),
	tags_json: text(),
	nav_section: text(),
	nav_title: text(),
	nav_order: integer(),
	nav_section_order: integer(),
	hide_from_nav: integer().default(0).notNull(),
	featured_order: integer(),
	status: text().default("draft").notNull(), // draft | published | scheduled | archived
	visibility: text().default("public").notNull(), // public | unlisted
	author_id: text().references(() => user.id, { onDelete: "set null" } ),
	featured_image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	social_image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	published_at: text(),
	first_published_at: text(),
	scheduled_for: text(),
	scheduled_revision_id: text(),
	slug_manually_overridden: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	seo_title: text(),
	seo_description: text(),
	seo_keywords: text(),
	canonical_url: text(),
	robots: text(),
}, (table) => [
	check("blog_posts_scope_check", sql`(organization_id IS NULL AND site_id IS NULL) OR (organization_id IS NOT NULL AND site_id IS NOT NULL)`),
	check("blog_posts_status_check", sql`status IN ('draft', 'published', 'scheduled', 'archived')`),
	check("blog_posts_visibility_check", sql`visibility IN ('public', 'unlisted')`),
	check("blog_posts_category_check", sql`site_id IS NOT NULL OR category IS NOT NULL`),
	uniqueIndex("blog_posts_platform_slug_idx").on(table.slug).where(sql`site_id IS NULL`),
	uniqueIndex("blog_posts_site_slug_idx").on(table.site_id, table.slug).where(sql`site_id IS NOT NULL`),
	index("blog_posts_org_site_idx").on(table.organization_id, table.site_id),
]);

export const blog_post_redirects = sqliteTable("blog_post_redirects", {
	id: text().primaryKey(),
	post_id: text().notNull().references(() => blog_posts.id, { onDelete: "cascade" }),
	site_id: text().references(() => sites.id, { onDelete: "cascade" }),
	old_slug: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("blog_post_redirects_platform_slug_idx").on(table.old_slug).where(sql`site_id IS NULL`),
	uniqueIndex("blog_post_redirects_site_slug_idx").on(table.site_id, table.old_slug).where(sql`site_id IS NOT NULL`),
	index("blog_post_redirects_post_idx").on(table.post_id),
]);

export const platform_contact_submissions = sqliteTable("platform_contact_submissions", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	topic: text(),
	message: text().notNull(),
	source: text().default("contact_page").notNull(),
	route_context: text(),
	suggested_summary: text(),
	agent_metadata_json: text(),
	status: text().default("new").notNull(),
	ip_hash: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const platform_content = sqliteTable("platform_content", {
	id: text().primaryKey(),
	page: text().notNull().unique(),
	content: text().notNull(),
	updated_by: text().references(() => user.id, { onDelete: "set null" } ),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const platform_docs = sqliteTable("platform_docs", {
	id: text().primaryKey(),
	title: text().notNull(),
	slug: text().notNull().unique(),
	body: text().notNull(),
	excerpt: text(),
	category: text(),
	nav_section: text(),
	nav_title: text(),
	nav_order: integer(),
	nav_section_order: integer(),
	nav_group: text(),
	nav_group_order: integer(),
	hide_from_nav: integer().default(0).notNull(),
	featured_order: integer(),
	author_id: text().references(() => user.id, { onDelete: "set null" } ),
	seo_description: text(),
	seo_keywords: text(),
	featured_image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	sort_order: integer().default(0),
	parent_doc_id: text(),
	difficulty_level: text(),
	status: text().default("draft").notNull(),
	published_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	canonical_url: text(),
	robots: text(),
});

export const post_channel_jobs = sqliteTable("post_channel_jobs", {
	id: text().primaryKey(),
	post_id: text().notNull().references(() => posts.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	channel: text().notNull(),
	status: text().default("pending").notNull(),
	provider_post_id: text(),
	error: text(),
	published_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("post_channel_jobs_post_channel_unique").on(table.post_id, table.channel),
	// WHERE post_id = ? in post-management.ts and mcp-executor/posts.ts (publish status checks).
	index("post_channel_jobs_post_id_idx").on(table.post_id),
]);

export const post_translations = sqliteTable("post_translations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	post_id: text().notNull().references(() => posts.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	title: text(),
	body: text(),
	event_title: text(),
	offer_terms: text(),
	status: text().default("draft").notNull(),
	source_hash: text(),
	translated_at: text(),
	reviewed_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("post_translations_organization_id_site_id_post_id_locale_unique").on(table.organization_id, table.site_id, table.post_id, table.locale),
	index("post_translations_post_id_idx").on(table.post_id),
]);

export const posts = sqliteTable("posts", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	google_post_id: text(),
	slug: text(),
	post_type: text().default("standard").notNull(),
	title: text(),
	body: text().notNull(),
	image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	seo_title: text(),
	seo_description: text(),
	og_image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	cta_type: text(),
	cta_url: text(),
	event_title: text(),
	event_start: text(),
	event_end: text(),
	offer_coupon: text(),
	offer_terms: text(),
	status: text().default("draft").notNull(),
	scheduled_for: text(),
	published_at: text(),
	source: text().default("manual").notNull(),
	created_by: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("posts_site_slug_idx").on(table.site_id, table.slug),
	check("posts_source_check", sql`source IN ('manual', 'template')`),
	index("posts_org_site_idx").on(table.organization_id, table.site_id),
]);

export const post_media = sqliteTable("post_media", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	post_id: text().notNull().references(() => posts.id, { onDelete: "cascade" } ),
	media_asset_id: text().notNull().references(() => media_assets.id, { onDelete: "cascade" } ),
	role: text().default("gallery").notNull(),
	sort_order: integer().default(0).notNull(),
	caption: text(),
	alt_text: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("post_media_post_idx").on(table.post_id, table.sort_order),
	check("post_media_role_check", sql`role IN ('cover', 'gallery')`),
	uniqueIndex("post_media_post_asset_unique").on(table.post_id, table.media_asset_id),
	uniqueIndex("post_media_cover_unique").on(table.post_id).where(sql`role = 'cover'`),
	index("post_media_org_site_idx").on(table.organization_id, table.site_id),
]);

export const rate_limits = sqliteTable("rate_limits", {
	key: text().primaryKey(),
	count: integer().default(0).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	expires_at: text(),
});

export const reservation_slot_overrides = sqliteTable("reservation_slot_overrides", {
	id: text().primaryKey(),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	override_date: text().notNull(),
	time_slot: text().notNull(),
	status: text().default("closed").notNull(),
	capacity_override: integer(),
	note: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text(),
}, (table) => [
	uniqueIndex("idx_reservation_slot_overrides_unique").on(table.location_id, table.override_date, table.time_slot),
	index("idx_reservation_slot_overrides_date").on(table.location_id, table.override_date),
	check("reservation_slot_overrides_status_check", sql`status IN ('closed', 'open')`),
	index("reservation_slot_overrides_org_site_idx").on(table.organization_id, table.site_id),
]);

export const reservation_submissions = sqliteTable("reservation_submissions", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	customer_id: text().references(() => customers.id, { onDelete: "set null" } ),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	email: text().notNull(),
	phone: text().notNull(),
	date: text().notNull(),
	time: text().notNull(),
	guests: text().notNull(),
	requests: text(),
	status: text().default("new").notNull(),
	ip_hash: text(),
	cancellation_token_hash: text(),
	cancellation_token_expires_at: text(),
	cancellation_token_used_at: text(),
	completed_at: text(),
	completion_source: text(),
	review_request_sent_at: text(),
	review_reminder_sent_at: text(),
	review_submitted_at: text(),
	review_id: text().references(() => reviews.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("idx_reservation_submissions_customer_id").on(table.customer_id),
	index("idx_reservation_submissions_review_request_due").on(table.site_id, table.status, table.completed_at, table.review_request_sent_at),
	index("idx_reservation_submissions_review_reminder_due").on(table.site_id, table.review_request_sent_at, table.review_reminder_sent_at, table.review_submitted_at),
	check("reservation_submissions_completion_source_check", sql`completion_source IS NULL OR completion_source IN ('manual', 'auto')`),
	index("reservation_submissions_organization_id_idx").on(table.organization_id),
]);

export const booking_policies = sqliteTable("booking_policies", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	policy_type: text({ enum: ["reservation", "experience"] }).notNull(),
	scope_type: text({ enum: ["site", "location", "experience"] }).notNull(),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	experience_id: text().references(() => experiences.id, { onDelete: "cascade" } ),
	booking_window_days: integer(),
	advance_notice_minutes: integer(),
	free_cancellation_until_minutes: integer(),
	late_arrival_grace_minutes: integer(),
	host_confirmation_sla_minutes: integer(),
	reschedule_allowed: numeric(),
	reschedule_cutoff_minutes: integer(),
	deposit_required: numeric(),
	deposit_trigger_party_size: integer(),
	special_requests_allowed: numeric(),
	weather_policy: text(),
	minimum_guest_age: integer(),
	accessibility_contact_required: numeric(),
	additional_notes_html: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("booking_policies_site_type_idx").on(table.site_id, table.policy_type),
	uniqueIndex("booking_policies_reservation_site_unique").on(table.site_id).where(sql`policy_type = 'reservation' AND scope_type = 'site'`),
	uniqueIndex("booking_policies_reservation_location_unique").on(table.location_id).where(sql`policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL`),
	uniqueIndex("booking_policies_experience_site_unique").on(table.site_id).where(sql`policy_type = 'experience' AND scope_type = 'site'`),
	uniqueIndex("booking_policies_experience_location_unique").on(table.location_id).where(sql`policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL`),
	uniqueIndex("booking_policies_experience_scope_unique").on(table.experience_id).where(sql`policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL`),
	check("booking_policies_policy_type_check", sql`policy_type IN ('reservation', 'experience')`),
	check("booking_policies_scope_type_check", sql`scope_type IN ('site', 'location', 'experience')`),
	index("booking_policies_organization_id_idx").on(table.organization_id),
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
	uniqueIndex("idx_review_requests_active_booking_unique")
		.on(table.site_id, table.booking_type, table.booking_id)
		.where(sql`revoked_at IS NULL AND submitted_at IS NULL`),
	index("idx_review_requests_send_due").on(table.site_id, table.first_sent_at, table.reminder_sent_at, table.submitted_at, table.expires_at),
	check("review_requests_booking_type_check", sql`booking_type IN ('reservation', 'experience_booking')`),
	index("review_requests_organization_id_idx").on(table.organization_id),
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
	menu_item_slug: text(),
	author_name: text(),
	reviewer_photo_url: text(),
	rating: integer().notNull(),
	title: text(),
	content: text(),
	google_review_id: text(),
	owner_reply: text(),
	owner_reply_at: text(),
	photo_urls: text(),
	helpful_count: integer().default(0),
	status: text().default("pending"),
	source: text().default("direct"),
	entered_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	collection_method: text(),
	original_review_date: text(),
	original_reference: text(),
	publication_authorized: integer().default(0).notNull(),
	ip_hash: text(),
	user_agent: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
	index("idx_reviews_request_id").on(table.review_request_id),
	index("idx_reviews_customer_id").on(table.customer_id),
	index("idx_reviews_location_status").on(table.location_id, table.status, table.created_at),
	index("idx_reviews_site_status").on(table.site_id, table.status, table.created_at).where(sql`location_id IS NULL`),
	check("reviews_booking_type_check", sql`booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking')`),
	check("reviews_rating_check", sql`rating BETWEEN 1 AND 5`),
	check("reviews_publication_authorized_check", sql`publication_authorized IN (0, 1)`),
	check("reviews_collection_method_check", sql`collection_method IS NULL OR collection_method IN ('in_person', 'email', 'phone', 'migration', 'other')`),
	check("reviews_owner_entered_provenance_check", sql`source != 'owner_entered' OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NULL AND entered_by_user_id IS NOT NULL AND collection_method IS NOT NULL AND publication_authorized = 1)`),
	index("reviews_organization_id_idx").on(table.organization_id),
]);

export const review_media = sqliteTable("review_media", {
	id: text().primaryKey(),
	review_id: text().references(() => reviews.id, { onDelete: "cascade" } ),
	review_request_id: text().notNull().references(() => review_requests.id, { onDelete: "cascade" } ),
	customer_id: text().notNull().references(() => customers.id, { onDelete: "cascade" } ),
	media_asset_id: text().notNull().references(() => media_assets.id, { onDelete: "cascade" } ),
	kind: text().notNull(),
	sort_order: integer().default(0).notNull(),
	status: text().default("pending").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("review_media_media_asset_id_unique").on(table.media_asset_id),
	index("idx_review_media_review_request_id").on(table.review_request_id),
	index("idx_review_media_review_id").on(table.review_id),
	check("review_media_kind_check", sql`kind IN ('image', 'video')`),
	check("review_media_status_check", sql`status IN ('pending', 'approved', 'rejected', 'deleted')`),
]);

export const service_addon_purchases = sqliteTable("service_addon_purchases", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	addon_type: text().notNull(),
	stripe_payment_intent_id: text(),
	fulfilled_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("service_addon_purchases_organization_id_idx").on(table.organization_id),
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

export const site_analytics_daily = sqliteTable("site_analytics_daily", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	date: text().notNull(),
	page_views: integer().default(0),
	unique_sessions: integer().default(0),
	avg_session_duration: integer().default(0),
	top_pages: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	unique_visitors: integer().default(0),
	pages_per_session: real(),
	returning_visitors: integer().default(0),
}, (table) => [
	unique("site_analytics_daily_site_id_date_unique").on(table.site_id, table.date),
]);

export const site_billing = sqliteTable("site_billing", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ).unique(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	stripe_subscription_id: text().unique(),
	stripe_subscription_item_id: text().unique(),
	plan: text().default("free").notNull(),
	status: text().default("free").notNull(),
	current_period_end: text(),
	cancel_at_period_end: numeric().default(sql`false`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	stripe_customer_id: text(),
	payment_method: text().default("stripe").notNull(),
	local_rate: integer(),
	local_currency: text(),
	last_reminder_sent_at: text(),
});

export const site_config = sqliteTable("site_config", {
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	key: text().notNull(),
	value: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.organization_id, table.site_id, table.key] }),
	index("site_config_org_site_idx").on(table.organization_id, table.site_id),
]);

export const site_content = sqliteTable("site_content", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	page: text().notNull(),
	field: text().notNull(),
	content: text(),
	hero_title: text(),
	hero_subtitle: text(),
	hero_image_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	hero_video_asset_id: text().references(() => media_assets_old.id, { onDelete: "set null" } ),
	value: text(),
	type: text().default("text").notNull(),
	source: text().default("manual").notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
	component: text(),
}, (table) => [
	unique("site_content_organization_id_site_id_location_id_page_field_unique").on(table.organization_id, table.site_id, table.location_id, table.page, table.field),
	uniqueIndex("idx_site_content_site_level_unique").on(table.organization_id, table.site_id, table.page, table.field).where(sql`location_id IS NULL`),
]);

export const site_content_translations = sqliteTable("site_content_translations", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	page: text().notNull(),
	field: text().notNull(),
	content: text(),
	hero_title: text(),
	hero_subtitle: text(),
	value: text(),
	type: text().default("text").notNull(),
	status: text().default("draft").notNull(),
	source_hash: text(),
	translated_at: text(),
	reviewed_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
	component: text(),
}, (table) => [
	unique("site_content_translations_organization_id_site_id_location_id_locale_page_field_unique").on(table.organization_id, table.site_id, table.location_id, table.locale, table.page, table.field),
	uniqueIndex("idx_site_content_translations_site_level_unique").on(table.organization_id, table.site_id, table.locale, table.page, table.field).where(sql`location_id IS NULL`),
]);

export const offerings = sqliteTable("offerings", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	name: text().notNull(),
	slug: text().notNull(),
	label: text(),
	summary: text(),
	short_description: text(),
	body: text(),
	features: text(),
	faqs: text(),
	cta_label: text(),
	cta_url: text(),
	thumbnail_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	hero_image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	media_asset_ids: text(),
	schema_type: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_path: text(),
	status: text().default("draft").notNull(),
	sort_order: integer().default(0).notNull(),
	featured: integer().default(0).notNull(),
	source: text().default("manual").notNull(),
	source_ref: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("offerings_organization_id_site_id_slug_unique").on(table.organization_id, table.site_id, table.slug),
	index("offerings_site_status_sort_idx").on(table.site_id, table.status, table.sort_order),
	check("offerings_status_check", sql`status IN ('draft', 'published', 'archived')`),
]);

export const tenant_pages = sqliteTable("tenant_pages", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	path: text().notNull(),
	title: text().notNull(),
	slug: text(),
	page_type: text().default("static").notNull(),
	summary: text(),
	body: text(),
	components_json: text(),
	cta_label: text(),
	cta_url: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	status: text().default("draft").notNull(),
	sort_order: integer().default(0).notNull(),
	source: text().default("manual").notNull(),
	source_ref: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("tenant_pages_organization_id_site_id_path_unique").on(table.organization_id, table.site_id, table.path),
	index("tenant_pages_site_status_sort_idx").on(table.site_id, table.status, table.sort_order),
	check("tenant_pages_path_check", sql`path LIKE '/%'`),
	check("tenant_pages_status_check", sql`status IN ('draft', 'published', 'archived')`),
]);

export const tenant_compliance = sqliteTable("tenant_compliance", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ).unique(),
	entity_name: text(),
	dba_name: text(),
	entity_type: text(),
	nonprofit_status: text(),
	registration_number: text(),
	service_area: text(),
	service_area_type: text(),
	disclaimer: text(),
	footer_disclaimer: text(),
	privacy_page_id: text().references(() => tenant_pages.id, { onDelete: "set null" } ),
	terms_page_id: text().references(() => tenant_pages.id, { onDelete: "set null" } ),
	notice_page_id: text().references(() => tenant_pages.id, { onDelete: "set null" } ),
	document_asset_ids: text(),
	founder_name: text(),
	founding_date: text(),
	same_as: text(),
	contact_points: text(),
	address_visibility: text().default("hidden").notNull(),
	metadata_json: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (_table) => [
	check("tenant_compliance_address_visibility_check", sql`address_visibility IN ('visible', 'hidden')`),
]);

export const site_consultation_settings = sqliteTable("site_consultation_settings", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ).unique(),
	mode: text().default("external_url").notNull(),
	cta_label: text().default("Book a consultation").notNull(),
	external_url: text(),
	schedule_path: text().default("/schedule").notNull(),
	confirmation_path: text().default("/contact/confirmed").notNull(),
	tracking_enabled: integer().default(1).notNull(),
	metadata_json: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	check("site_consultation_settings_mode_check", sql`mode IN ('external_url', 'native_disabled')`),
	check("site_consultation_settings_schedule_path_check", sql`schedule_path LIKE '/%'`),
	check("site_consultation_settings_confirmation_path_check", sql`confirmation_path LIKE '/%'`),
	index("site_consultation_settings_organization_id_idx").on(table.organization_id),
]);

export const site_theme_tokens = sqliteTable("site_theme_tokens", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	template_slug: text().notNull(),
	tokens_json: text().notNull(),
	status: text().default("active").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("site_theme_tokens_site_template_unique").on(table.site_id, table.template_slug),
	check("site_theme_tokens_status_check", sql`status IN ('active', 'disabled')`),
	index("site_theme_tokens_organization_id_idx").on(table.organization_id),
]);

export const tenant_navigation_items = sqliteTable("tenant_navigation_items", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	area: text().default("header").notNull(),
	label: text().notNull(),
	url: text().notNull(),
	item_type: text().default("internal").notNull(),
	sort_order: integer().default(0).notNull(),
	status: text().default("active").notNull(),
	metadata_json: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	index("tenant_navigation_items_site_area_sort_idx").on(table.site_id, table.area, table.sort_order),
	check("tenant_navigation_items_area_check", sql`area IN ('header', 'footer', 'legal', 'social')`),
	check("tenant_navigation_items_status_check", sql`status IN ('active', 'hidden')`),
	index("tenant_navigation_items_organization_id_idx").on(table.organization_id),
]);

export const tenant_redirects = sqliteTable("tenant_redirects", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	from_path: text().notNull(),
	to_path: text(),
	status_code: integer().default(301).notNull(),
	behavior: text().default("redirect").notNull(),
	reason: text(),
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("tenant_redirects_site_from_path_unique").on(table.site_id, table.from_path),
	check("tenant_redirects_from_path_check", sql`from_path LIKE '/%'`),
	check("tenant_redirects_behavior_check", sql`behavior IN ('redirect', 'gone', 'noindex')`),
	check("tenant_redirects_redirect_to_path_check", sql`behavior != 'redirect' OR to_path IS NOT NULL`),
	index("tenant_redirects_organization_id_idx").on(table.organization_id),
]);

export const site_conversion_events = sqliteTable("site_conversion_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	event_name: text().notNull(),
	page_type: text(),
	page_path: text(),
	page_location: text(),
	cta_destination: text(),
	tenant: text(),
	metadata_json: text(),
	ip_hash: text(),
	user_agent: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("site_conversion_events_site_created_idx").on(table.site_id, table.created_at),
	index("site_conversion_events_name_created_idx").on(table.event_name, table.created_at),
	check("site_conversion_events_name_check", sql`(event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64`),
	index("site_conversion_events_organization_id_idx").on(table.organization_id),
]);

export const client_import_artifacts = sqliteTable("client_import_artifacts", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	slug: text().notNull(),
	artifact_type: text().notNull(),
	path: text().notNull(),
	hash: text(),
	status: text().default("generated").notNull(),
	summary_json: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("client_import_artifacts_slug_type_path_unique").on(table.slug, table.artifact_type, table.path),
	check("client_import_artifacts_status_check", sql`status IN ('generated', 'approved', 'applied', 'superseded')`),
]);

export const site_domain_events = sqliteTable("site_domain_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	domain_id: text().references(() => site_domains.id, { onDelete: "set null" } ),
	event_type: text().notNull(),
	actor_type: text().default("system").notNull(),
	actor_id: text(),
	message: text(),
	before_state: text(),
	after_state: text(),
	metadata: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
	// WHERE domain_id = ? in domains.ts - organization_id/site_id are only ever joined, never
	// filtered directly, per grep of actual call sites.
	index("site_domain_events_domain_id_idx").on(table.domain_id),
]);

export const site_domains = sqliteTable("site_domains", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
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
	dns_target: text(),
	dns_status: text().default("pending").notNull(),
	last_synced_at: text(),
	next_check_at: text(),
	retry_count: integer().default(0).notNull(),
	activated_at: text(),
	error_message: text(),
	metadata: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
	index("site_domains_org_site_idx").on(table.organization_id, table.site_id),
]);

export const site_entitlements = sqliteTable("site_entitlements", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	key: text().notNull(),
	value: text(),
	source: text().default("system").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_entitlements_site_id_key_unique").on(table.site_id, table.key),
	index("site_entitlements_organization_id_idx").on(table.organization_id),
]);

export const site_events = sqliteTable("site_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	actor_id: text().references(() => user.id, { onDelete: "set null" } ),
	event_type: text().notNull(),
	entity_type: text(),
	entity_id: text(),
	metadata: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("site_events_org_site_idx").on(table.organization_id, table.site_id),
]);

export const site_locales = sqliteTable("site_locales", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	label: text(),
	is_source: numeric().default(sql`false`).notNull(),
	status: text().default("draft").notNull(),
	fallback_enabled: numeric().default(sql`1`).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_locales_organization_id_site_id_locale_unique").on(table.organization_id, table.site_id, table.locale),
	uniqueIndex("idx_site_locales_one_source_per_site").on(table.organization_id, table.site_id).where(sql`is_source = 1`),
]);

export const platform_pageview_events = sqliteTable("platform_pageview_events", {
	id: text().primaryKey(),
	page_path: text().notNull(),
	referrer: text(),
	user_agent: text(),
	ip_hash: text(),
	session_id: text(),
	visitor_id: text(),
	duration_seconds: integer(),
	country: text(),
	region: text(),
	city: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const platform_analytics_daily = sqliteTable("platform_analytics_daily", {
	id: text().primaryKey(),
	date: text().notNull().unique(),
	page_views: integer().default(0),
	unique_sessions: integer().default(0),
	avg_session_duration: integer().default(0),
	unique_visitors: integer().default(0),
	pages_per_session: real(),
	returning_visitors: integer().default(0),
	top_pages: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const site_pageview_events = sqliteTable("site_pageview_events", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	page_path: text().notNull(),
	referrer: text(),
	user_agent: text(),
	ip_hash: text(),
	session_id: text(),
	duration_seconds: integer(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	visitor_id: text(),
	country: text(),
	region: text(),
	city: text(),
}, (table) => [
	// Every query in server/utils/analytics.ts is WHERE site_id = ? AND created_at >= ? AND
	// created_at < ? (customer-facing analytics dashboard) - mirrors the existing
	// site_conversion_events_site_created_idx composite pattern in this same schema.
	index("site_pageview_events_site_created_idx").on(table.site_id, table.created_at),
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
	duration_ms: integer(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("idx_mcp_tool_call_events_created_at").on(table.created_at),
	index("idx_mcp_tool_call_events_tool_status").on(table.tool_name, table.status),
	index("idx_mcp_tool_call_events_site").on(table.site_id, table.created_at),
	index("idx_mcp_tool_call_events_org").on(table.organization_id, table.created_at),
]);

export const site_transfer_requests = sqliteTable("site_transfer_requests", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	from_organization_id: text().notNull(),
	to_email: text().notNull(),
	token: text().notNull(),
	status: text().default("pending").notNull(),
	initiated_by_user_id: text().notNull().references(() => user.id, { onDelete: "restrict" } ),
	accepted_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	claiming_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	claiming_organization_id: text(),
	message: text(),
	invited_plan: text(),
	invited_coupon: text(),
	invited_domain: text(),
	requires_payment: integer().default(0).notNull(),
	stripe_checkout_session_id: text(),
	payment_completed_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	completed_at: text(),
	last_reminder_at: text(),
	reminder_count: integer().default(0).notNull(),
	custom_domains_snapshot: text(),
	custom_domains_removed_at: text(),
	invited_interval: text().default("month").notNull(),
}, (table) => [
	index("site_transfer_requests_site_id_idx").on(table.site_id),
]);

export const sites = sqliteTable("sites", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	theme_id: text().default("saya-theme-v1").notNull().references(() => themes.id),
	theme: text().default("saya").notNull(),
	slug: text().notNull().unique(),
	subdomain: text().unique(),
	custom_domain: text(),
	custom_domain_status: text().default("none"),
	primary_location_id: text(),
	public_url: text(),
	brand_name: text(),
	brand_description: text(),
	logo_url: text(),
	logo_asset_id: text().references((): AnySQLiteColumn => media_assets.id, { onDelete: "set null" } ),
	contact_email: text(),
	contact_phone: text(),
	source_locale: text().default("en").notNull(),
	default_currency: text().default("THB").notNull(),
	status: text().default("active"),
	plan: text().default("free"),
	onboarding_status: text().default("pending"),
	url_structure: text().default("location_subdirectories").notNull(),
	vertical: text().default("restaurant").notNull(),
	content_source: text(),
	media_source: text(),
	settings: text(),
	last_published_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_by: text(),
	og_image_asset_id: text().references((): AnySQLiteColumn => media_assets.id, { onDelete: "set null" } ),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
}, (table) => [
	check("sites_status_check", sql`${table.status} IN ('active', 'inactive', 'suspended')`),
	check("sites_plan_check", sql`${table.plan} IN ('free', 'growth', 'managed', 'seo_accelerator')`),
	check("sites_onboarding_status_check", sql`${table.onboarding_status} IN ('pending', 'active', 'failed')`),
	check("sites_url_structure_check", sql`${table.url_structure} IN ('location_subdirectories', 'brand_pages')`),
	check("sites_vertical_check", sql`${table.vertical} IN ('restaurant', 'experience', 'retail', 'wellness', 'service')`),
	check("sites_content_source_check", sql`${table.content_source} IN ('google_maps', 'client_supplied', 'generated')`),
	check("sites_media_source_check", sql`${table.media_source} IN ('client_photos', 'stock', 'mixed')`),
	// organization_id is the join/filter column in dozens of call sites across the codebase
	// (dashboard context resolution, MCP site listing/auth, billing, editor routes). Confirmed
	// via wrangler d1 insights as driving two of the top four rows-read queries post-cron-fix
	// (66.9M rows/9,778 executions and 17.2M rows/4,034 executions) - without this index those
	// queries full-scan sites on every request.
	index("sites_organization_id_idx").on(table.organization_id),
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
	status: text().default("pending"),
	payload: text(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const themes = sqliteTable("themes", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull().unique(),
	version: text().default("1.0.0"),
	description: text(),
	status: text().default("active"),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const token_exchange_cache = sqliteTable("token_exchange_cache", {
	code: text().primaryKey(),
	state: text().default("pending").notNull(),
	response_body: text().default("").notNull(),
	http_status: integer().default(0).notNull(),
	created_at: text().notNull(),
	expires_at: text().notNull(),
});

export const translation_job_items = sqliteTable("translation_job_items", {
	id: text().primaryKey(),
	job_id: text().notNull().references(() => translation_jobs.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	target_locale: text().notNull(),
	entity_type: text().notNull(),
	entity_id: text().notNull(),
	location_id: text(),
	page: text(),
	field: text().notNull(),
	source_hash: text().notNull(),
	source_chars: integer().default(0).notNull(),
	status: text().default("queued").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("translation_job_items_job_id_idx").on(table.job_id),
	index("translation_job_items_org_site_idx").on(table.organization_id, table.site_id),
]);

export const translation_jobs = sqliteTable("translation_jobs", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	source_locale: text().notNull(),
	target_locale: text().notNull(),
	scope: text().default("site").notNull(),
	status: text().default("queued").notNull(),
	total_items: integer().default(0).notNull(),
	total_chars: integer().default(0).notNull(),
	estimated_input_tokens: integer().default(0).notNull(),
	estimated_output_tokens: integer().default(0).notNull(),
	estimated_credits: integer().default(0).notNull(),
	actual_input_tokens: integer().default(0).notNull(),
	actual_output_tokens: integer().default(0).notNull(),
	actual_credits: integer().default(0).notNull(),
	processed_items: integer().default(0).notNull(),
	failed_items: integer().default(0).notNull(),
	error: text(),
	created_by: text(),
	started_at: text(),
	finished_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("translation_jobs_org_site_idx").on(table.organization_id, table.site_id),
]);

export const user = sqliteTable("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: integer().default(0).notNull(),
	image: text(),
	phoneNumber: text().unique(),
	phoneNumberVerified: integer().default(0).notNull(),
	role: text().default("user"),
	banned: integer().default(0),
	banReason: text(),
	banExpires: integer({ mode: "timestamp" }),
	isAnonymous: integer().default(0).notNull(),
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

export const work_requests = sqliteTable("work_requests", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	type: text().notNull(),
	title: text().notNull(),
	description: text(),
	status: text().default("pending").notNull(),
	priority: text().default("normal").notNull(),
	source: text().default("dashboard").notNull(),
	notes: text(),
	assigned_to: text().references(() => user.id, { onDelete: "set null" } ),
	completed_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	// WHERE organization_id = ? on /api/dashboard/work-requests.get.ts (customer-facing), plus
	// mcp-workflows.ts and the admin listing. site_id is only ever SELECTed/joined, not filtered.
	index("work_requests_organization_id_idx").on(table.organization_id),
]);

export const experiences = sqliteTable("experiences", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	slug: text().notNull(),
	tagline: text(),
	body: text(),
	image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	video_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	images: text(),
	price: text(),
	price_amount: numeric(),
	compare_at_price_amount: numeric(),
	sale_starts_at: text(),
	sale_ends_at: text(),
	duration_minutes: integer(),
	max_capacity: integer(),
	time_slots: text(),
	recurring_slots: text(),
	available_note: text(),
	status: text().default("active").notNull(),
	sort_order: integer().default(0).notNull(),
	featured: numeric().default(sql`false`).notNull(),
	featured_sort_order: integer().default(0).notNull(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	og_image_asset_id: text().references(() => media_assets.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text(),
	highlights: text(),
	included_items: text(),
	what_to_bring: text(),
	meeting_point: text(),
	cancellation_policy: text(),
	source: text().default("manual").notNull(),
}, (table) => [
	check("experiences_source_check", sql`source IN ('manual', 'template')`),
	index("experiences_org_site_idx").on(table.organization_id, table.site_id),
]);

export const mcp_workspace_preferences = sqliteTable("mcp_workspace_preferences", {
	user_id: text().primaryKey().references(() => user.id, { onDelete: "cascade" } ),
	organization_id: text().references(() => organization.id, { onDelete: "set null" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

export const google_analytics_connections = sqliteTable("google_analytics_connections", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	connected_by_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	provider_account_email: text().notNull(),
	encrypted_access_token: text().notNull(),
	encrypted_refresh_token: text().notNull(),
	scopes: text().notNull(),
	ga4_property_id: text(),
	ga4_property_name: text(),
	ga4_measurement_id: text(),
	search_console_site_url: text(),
	status: text().default("active").notNull(),
	expires_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("google_analytics_connections_organization_id_site_id_unique").on(table.organization_id, table.site_id),
]);

export const zaraz_sync_lock = sqliteTable("zaraz_sync_lock", {
	id: text().primaryKey(),
	locked_at: text(),
});

export const platform_content_components = sqliteTable("platform_content_components", {
	id: text().primaryKey(),
	content_type: text().notNull(),
	content_id: text().notNull(),
	type: text().notNull(),
	position: integer().default(0).notNull(),
	data_json: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	label: text(),
	status: text().default("active").notNull(),
	render_enabled: integer().default(1).notNull(),
	schema_enabled: integer().default(1).notNull(),
});

export const content_documents = sqliteTable("content_documents", {
	id: text().primaryKey(),
	owner_type: text().notNull(),
	owner_id: text().notNull(),
	draft_revision_id: text(),
	published_revision_id: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("content_documents_owner_type_check", sql`owner_type IN ('platform_blog', 'platform_doc', 'tenant_blog')`),
	unique("content_documents_owner_unique").on(table.owner_type, table.owner_id),
	index("content_documents_owner_idx").on(table.owner_type, table.owner_id),
]);

export const content_blocks = sqliteTable("content_blocks", {
	id: text().primaryKey(),
	document_id: text().notNull().references(() => content_documents.id, { onDelete: "cascade" } ),
	parent_block_id: text(),
	type: text().notNull(),
	position: integer().default(0).notNull(),
	level: integer(),
	data_json: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("content_blocks_type_check", sql`type IN ('heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'divider', 'ai_assistance', 'cta', 'callout')`),
	index("content_blocks_document_position_idx").on(table.document_id, table.position),
	index("content_blocks_parent_idx").on(table.parent_block_id),
]);

export const content_revisions = sqliteTable("content_revisions", {
	id: text().primaryKey(),
	document_id: text().notNull().references(() => content_documents.id, { onDelete: "cascade" } ),
	snapshot_json: text().notNull(),
	body_markdown: text().notNull(),
	created_by: text().references(() => user.id, { onDelete: "set null" } ),
	label: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("content_revisions_document_created_idx").on(table.document_id, table.created_at),
]);
