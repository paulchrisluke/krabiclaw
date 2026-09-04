import { sql } from "drizzle-orm"
import { sqliteTable, integer, text, numeric, real, unique, primaryKey, uniqueIndex, index, check, foreignKey } from "drizzle-orm/sqlite-core"
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
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
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
	// JSON { enabled?: ProductFeature[]; disabled?: ProductFeature[] } delta (config/cms-registry.ts).
	// NULL means "inherit the parent site's effective feature set" — never the vertical defaults
	// directly. `enabled` entries must always be a subset of what the site itself resolves to;
	// `disabled` entries are always safe (a location can turn off anything it inherited).
	feature_overrides: text(),
}, (table) => [
	unique("business_locations_organization_id_site_id_slug_unique").on(table.organization_id, table.site_id, table.slug),
	unique("business_locations_organization_id_site_id_id_unique").on(table.organization_id, table.site_id, table.id),
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
}, (table) => [
	index("idx_canary_runs_status_created").on(table.status, table.created_at),
	index("idx_canary_runs_type_created").on(table.run_type, table.created_at),
]);

export const chowbot_channel_state = sqliteTable("chowbot_channel_state", {
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	channel: text().notNull(),
	selected_site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	active_conversation_id: text().references(() => chowbot_conversations.id, { onDelete: "set null" } ),
	pending_message_id: text().references((): AnySQLiteColumn => chowbot_messages.id, { onDelete: "set null" } ),
	pending_confirmation: text(),
	last_inbound_id: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.user_id, table.channel] }),
	foreignKey({
		columns: [table.active_conversation_id, table.selected_site_id, table.user_id],
		foreignColumns: [chowbot_conversations.id, chowbot_conversations.site_id, chowbot_conversations.user_id],
		name: "chowbot_channel_state_conversation_scope_fk",
	}),
	check("chowbot_channel_state_active_site_check", sql`active_conversation_id IS NULL OR selected_site_id IS NOT NULL`),
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
	unique("chowbot_conversations_id_site_user_unique").on(table.id, table.site_id, table.user_id),
	unique("chowbot_conversations_id_org_site_unique").on(table.id, table.organization_id, table.site_id),
	index("chowbot_conversations_org_site_idx").on(table.organization_id, table.site_id),
	index("chowbot_conversations_user_id_idx").on(table.user_id),
	index("idx_chowbot_conversations_site").on(table.site_id, table.user_id, table.status, table.updated_at),
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
	meta_message_id: text().unique(),
	tool_calls: text(),
	status: text().default("sent").notNull(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.conversation_id, table.organization_id, table.site_id],
		foreignColumns: [chowbot_conversations.id, chowbot_conversations.organization_id, chowbot_conversations.site_id],
		name: "chowbot_messages_conversation_scope_fk",
	}),
	index("idx_chowbot_messages_conversation").on(table.conversation_id, table.created_at),
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
	location_id: text().references(() => business_locations.id, { onDelete: "set null" }),
	experience_id: text().references(() => experiences.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("contact_submissions_org_site_idx").on(table.organization_id, table.site_id),
	index("contact_submissions_location_idx").on(table.location_id, table.created_at),
	index("idx_contact_submissions_site").on(table.site_id, table.created_at),
]);

export const guest_threads = sqliteTable("guest_threads", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references((): AnySQLiteColumn => business_locations.id, { onDelete: "set null" } ),
	submission_type: text().notNull(),
	submission_id: text().notNull(),
	guest_name: text().notNull(),
	guest_email: text(),
	guest_phone: text(),
	conversation_state: text().default("needs_attention").notNull(),
	resolved_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("guest_threads_submission_unique").on(table.submission_type, table.submission_id),
	index("guest_threads_site_updated_idx").on(table.site_id, table.updated_at),
	index("guest_threads_location_updated_idx").on(table.location_id, table.updated_at),
	index("guest_threads_conversation_state_idx").on(table.site_id, table.conversation_state, table.updated_at),
	check("guest_threads_submission_type_check", sql`submission_type IN ('contact', 'reservation', 'experience_booking')`),
	check("guest_threads_conversation_state_check", sql`conversation_state IN ('needs_attention', 'waiting_on_guest', 'resolved')`),
	index("guest_threads_organization_id_idx").on(table.organization_id),
]);

// Canonical append-only conversation/history ledger for a guest thread (issue #442).
// Replaces submission_messages as the sole timeline store. Entries are facts and are
// never rewritten; corrections are new entries.
export const guest_thread_entries = sqliteTable("guest_thread_entries", {
	id: text().primaryKey(),
	thread_id: text().notNull().references(() => guest_threads.id, { onDelete: "cascade" } ),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	kind: text().notNull(),
	actor_kind: text().notNull(),
	actor_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	channel: text(),
	body: text(),
	event_name: text(),
	payload_json: text(),
	dedupe_key: text().notNull(),
	sequence: integer().notNull(),
	occurred_at: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("guest_thread_entries_thread_occurred_idx").on(table.thread_id, table.occurred_at),
	unique("guest_thread_entries_id_thread_unique").on(table.id, table.thread_id),
	unique("guest_thread_entries_thread_sequence_unique").on(table.thread_id, table.sequence),
	uniqueIndex("guest_thread_entries_dedupe_key_unique").on(table.dedupe_key),
	index("guest_thread_entries_site_kind_occurred_idx").on(table.site_id, table.kind, table.occurred_at),
	index("guest_thread_entries_organization_id_idx").on(table.organization_id),
	check("guest_thread_entries_kind_check", sql`kind IN ('submission', 'message', 'operation', 'assignment', 'resolution')`),
	check("guest_thread_entries_actor_kind_check", sql`actor_kind IN ('guest', 'member', 'system')`),
	check("guest_thread_entries_channel_check", sql`channel IS NULL OR channel IN ('web', 'email', 'whatsapp', 'system')`),
]);

export const guest_thread_deliveries = sqliteTable("guest_thread_deliveries", {
	id: text().primaryKey(),
	thread_id: text().notNull().references(() => guest_threads.id, { onDelete: "cascade" } ),
	entry_id: text().notNull(),
	channel: text().notNull(),
	provider: text().notNull(),
	purpose: text().notNull(),
	idempotency_key: text().notNull(),
	status: text().default("pending").notNull(),
	provider_message_id: text(),
	error: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.entry_id, table.thread_id],
		foreignColumns: [guest_thread_entries.id, guest_thread_entries.thread_id],
		name: "guest_thread_deliveries_entry_thread_fk",
	}).onDelete("cascade"),
	uniqueIndex("guest_thread_deliveries_idempotency_key_unique").on(table.idempotency_key),
	uniqueIndex("guest_thread_deliveries_provider_message_unique").on(table.provider, table.provider_message_id).where(sql`provider_message_id IS NOT NULL`),
	index("guest_thread_deliveries_thread_status_idx").on(table.thread_id, table.status),
	check("guest_thread_deliveries_channel_check", sql`channel IN ('email', 'whatsapp')`),
	check("guest_thread_deliveries_provider_check", sql`(channel = 'email' AND provider IN ('resend', 'log_only')) OR (channel = 'whatsapp' AND provider IN ('meta', 'log_only'))`),
	check("guest_thread_deliveries_purpose_check", sql`purpose IN ('owner_alert', 'guest_acknowledgement', 'member_reply', 'status_update')`),
	check("guest_thread_deliveries_status_check", sql`status IN ('pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown')`),
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
}, (table) => [
	index("idx_domain_reconciliation_jobs_due").on(table.status, table.run_after),
]);

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
	index("idx_experience_slot_overrides_date").on(table.experience_id, table.override_date),
	uniqueIndex("idx_experience_slot_overrides_unique").on(table.experience_id, table.override_date, table.time_slot),
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

export const location_qa = sqliteTable("location_qa", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "cascade" } ),
	page_path: text(),
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
	index("idx_location_qa_location").on(table.location_id, table.status, table.sort_order),
	index("idx_location_qa_site").on(table.site_id, table.status, table.sort_order).where(sql`location_id IS NULL`),
	index("idx_location_qa_page").on(table.site_id, table.page_path, table.status, table.sort_order).where(sql`location_id IS NULL AND page_path IS NOT NULL`),
	check("location_qa_scope_check", sql`location_id IS NULL OR page_path IS NULL`),
	check("location_qa_page_path_check", sql`page_path IS NULL OR page_path LIKE '/%'`),
	check("location_qa_source_check", sql`source IN ('manual','import','template')`),
	check("location_qa_status_check", sql`status IN ('published','hidden')`),
	index("location_qa_organization_id_idx").on(table.organization_id),
]);

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
	// The historical site/status index covers the media library query path.
}, (table) => [
	check("media_assets_category_check", sql`category IS NULL OR category IN ('exterior', 'interior', 'food', 'menu', 'team', 'other', 'logo', 'blog')`),
	check("media_assets_video_thumbnail_check", sql`kind <> 'video' OR (thumbnail_url IS NOT NULL AND length(trim(thumbnail_url)) > 0)`),
	check("media_assets_status_check", sql`status IN ('pending', 'active', 'deleted', 'failed')`),
	check("media_assets_provider_check", sql`provider IN ('cloudflare_images', 'cloudflare_r2')`),
	check("media_assets_source_check", sql`source IN ('uploaded', 'generated', 'external')`),
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
	foreignKey({
		columns: [table.organization_id, table.site_id, table.asset_id],
		foreignColumns: [media_assets.organization_id, media_assets.site_id, media_assets.id],
		name: "media_placements_asset_scope_fk",
	}).onDelete("cascade"),
	check("media_placements_status_check", sql`${table.status} IN ('pending', 'active', 'rejected')`),
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

// A category is a record, not a string on each Product. Category order lives in
// product_categories.sort_order, and products.sort_order orders items *within*
// one category. Categories are scoped by product_type so the single hardcoded
// 'Experiences' category never collides with a restaurant's menu sections.
export const product_categories = sqliteTable("product_categories", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" }),
	product_type: text().$type<'standard' | 'experience'>().default("standard").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	sort_order: integer().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id],
		foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id],
		name: "product_categories_location_scope_fk",
	}).onDelete("cascade"),
	// product_type is part of the parent key so the Products foreign key below can
	// match on it: without that, a 'standard' Product could reference the
	// location's 'experience' category and only application code would object.
	unique("product_categories_scope_id_unique").on(table.organization_id, table.site_id, table.location_id, table.product_type, table.id),
	unique("product_categories_location_type_slug_unique").on(table.site_id, table.location_id, table.product_type, table.slug),
	unique("product_categories_location_type_name_unique").on(table.site_id, table.location_id, table.product_type, table.name),
	index("product_categories_location_type_sort_idx").on(table.site_id, table.location_id, table.product_type, table.sort_order),
	check("product_categories_name_not_blank_check", sql`trim(${table.name}) <> ''`),
	check("product_categories_slug_check", sql`${table.slug} <> '' AND ${table.slug} = lower(${table.slug}) AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND ${table.slug} NOT LIKE '-%' AND ${table.slug} NOT LIKE '%-' AND ${table.slug} NOT LIKE '%--%'`),
	check("product_categories_sort_order_check", sql`${table.sort_order} >= 0`),
	check("product_categories_type_check", sql`${table.product_type} IN ('standard', 'experience')`),
]);

export const products = sqliteTable("products", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" }),
	product_type: text().$type<'standard' | 'experience'>().default("standard").notNull(),
	category_id: text().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text().default("").notNull(),
	order_url: text(),
	is_visible: integer({ mode: "boolean" }).default(true).notNull(),
	available: integer({ mode: "boolean" }).default(true).notNull(),
	featured: integer({ mode: "boolean" }).default(false).notNull(),
	featured_sort_order: integer().default(0).notNull(),
	sort_order: integer().notNull(),
	tags_json: text().default("[]").notNull(),
	details_json: text().default("[]").notNull(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	source: text().default("manual").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by: text().notNull(),
	updated_by: text().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id],
		foreignColumns: [business_locations.organization_id, business_locations.site_id, business_locations.id],
		name: "products_location_scope_fk",
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id, table.product_type, table.category_id],
		foreignColumns: [product_categories.organization_id, product_categories.site_id, product_categories.location_id, product_categories.product_type, product_categories.id],
		name: "products_category_scope_fk",
	}).onDelete("cascade"),
	unique("products_scope_id_unique").on(table.organization_id, table.site_id, table.location_id, table.id),
	unique("products_site_location_slug_unique").on(table.site_id, table.location_id, table.slug),
	index("products_category_sort_order_idx").on(table.category_id, table.sort_order),
	index("products_site_location_type_sort_order_idx").on(table.site_id, table.location_id, table.product_type, table.sort_order),
	index("products_site_location_visible_sort_idx").on(table.site_id, table.location_id, table.is_visible, table.sort_order),
	index("products_site_location_featured_sort_idx").on(table.site_id, table.location_id, table.featured, table.featured_sort_order),
	index("products_organization_site_idx").on(table.organization_id, table.site_id),
	check("products_name_not_blank_check", sql`trim(${table.name}) <> ''`),
	check("products_slug_check", sql`${table.slug} <> '' AND ${table.slug} = lower(${table.slug}) AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND ${table.slug} NOT LIKE '-%' AND ${table.slug} NOT LIKE '%-' AND ${table.slug} NOT LIKE '%--%'`),
	check("products_sort_order_check", sql`${table.sort_order} >= 0`),
	check("products_featured_sort_order_check", sql`${table.featured_sort_order} >= 0`),
	check("products_boolean_check", sql`${table.is_visible} IN (0, 1) AND ${table.available} IN (0, 1) AND ${table.featured} IN (0, 1)`),
	check("products_type_check", sql`${table.product_type} IN ('standard', 'experience')`),
	check("products_tags_json_check", sql`json_valid(${table.tags_json}) AND json_type(${table.tags_json}) = 'array'`),
	check("products_details_json_check", sql`json_valid(${table.details_json}) AND json_type(${table.details_json}) = 'array'`),
	check("products_source_check", sql`${table.source} IN ('manual', 'template', 'ai', 'import', 'copy')`),
	check("products_order_url_check", sql`${table.order_url} IS NULL OR (${table.order_url} LIKE 'https://_%' AND instr(${table.order_url}, '@') = 0 AND instr(${table.order_url}, char(10)) = 0 AND instr(${table.order_url}, char(13)) = 0)`),
	check("products_robots_check", sql`${table.robots} IS NULL OR ${table.robots} IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow')`),
]);

export const prices = sqliteTable("prices", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" }),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" }),
	product_id: text().notNull().references(() => products.id, { onDelete: "cascade" }),
	amount_minor: integer().notNull(),
	currency: text().notNull(),
	unit: text().$type<'item' | 'person' | 'table'>().default("item").notNull(),
	tax_behavior: text().$type<'unspecified' | 'inclusive' | 'exclusive'>().default("unspecified").notNull(),
	compare_at_amount_minor: integer(),
	valid_from: text().notNull(),
	valid_until: text(),
	provenance: text().notNull(),
	created_by: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id, table.product_id],
		foreignColumns: [products.organization_id, products.site_id, products.location_id, products.id],
		name: "prices_product_scope_fk",
	}).onDelete("cascade"),
	index("prices_product_validity_idx").on(table.organization_id, table.site_id, table.product_id, table.valid_from, table.valid_until),
	index("prices_site_location_validity_idx").on(table.site_id, table.location_id, table.valid_from, table.valid_until),
	check("prices_amount_check", sql`${table.amount_minor} >= 0`),
	check("prices_compare_at_check", sql`${table.compare_at_amount_minor} IS NULL OR ${table.compare_at_amount_minor} > ${table.amount_minor}`),
	check("prices_currency_check", sql`${table.currency} IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR')`),
	check("prices_unit_check", sql`${table.unit} IN ('item', 'person', 'table')`),
	check("prices_tax_behavior_check", sql`${table.tax_behavior} IN ('unspecified', 'inclusive', 'exclusive')`),
	check("prices_validity_check", sql`${table.valid_until} IS NULL OR ${table.valid_until} > ${table.valid_from}`),
]);

export const notifications = sqliteTable("notifications", {
	id: text().primaryKey(),
	organization_id: text().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	guest_thread_id: text().references(() => guest_threads.id, { onDelete: "cascade" } ),
	source_entry_id: text(),
	scope: text().default("organization").notNull(),
	event_type: text().notNull(),
	severity: text().default("info").notNull(),
	actor_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	target_user_id: text().references(() => user.id, { onDelete: "set null" } ),
	deep_link: text(),
	message: text(),
	template: text().notNull(),
	title: text(),
	payload: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.source_entry_id, table.guest_thread_id],
		foreignColumns: [guest_thread_entries.id, guest_thread_entries.thread_id],
		name: "notifications_source_entry_thread_fk",
	}).onDelete("cascade"),
	index("notifications_scope_created_at_idx").on(table.scope, table.created_at),
	index("notifications_organization_created_at_idx").on(table.organization_id, table.created_at),
	index("notifications_site_created_at_idx").on(table.site_id, table.created_at),
	index("notifications_target_user_created_at_idx").on(table.target_user_id, table.created_at),
	index("notifications_guest_thread_created_at_idx").on(table.guest_thread_id, table.created_at),
	uniqueIndex("notifications_source_entry_unique").on(table.source_entry_id).where(sql`source_entry_id IS NOT NULL`),
	check("notifications_thread_source_check", sql`(guest_thread_id IS NULL AND source_entry_id IS NULL) OR (guest_thread_id IS NOT NULL AND source_entry_id IS NOT NULL)`),
]);

export const notification_reads = sqliteTable("notification_reads", {
	notification_id: text().notNull().references(() => notifications.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => user.id, { onDelete: "cascade" } ),
	read_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	primaryKey({ columns: [table.notification_id, table.user_id] }),
	index("notification_reads_user_read_at_idx").on(table.user_id, table.read_at),
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
	slug: text().notNull().unique(),
	logo: text(),
	metadata: text(),
	// Better Auth Stripe plugin organization customer field.
	stripeCustomerId: text().unique(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	check("organization_slug_required_check", sql`trim(${table.slug}) <> ''`),
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
	limits: text(),
	cancelAtPeriodEnd: integer().default(0).notNull(),
	cancelAt: integer({ mode: "timestamp" }),
	canceledAt: integer({ mode: "timestamp" }),
	endedAt: integer({ mode: "timestamp" }),
	seats: integer(),
	billingInterval: text(),
	stripeScheduleId: text(),
	createdAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
	updatedAt: integer({ mode: "timestamp" }).default(sql`(unixepoch())`).notNull(),
}, (table) => [
	index("subscription_referenceId_idx").on(table.referenceId),
	index("subscription_status_idx").on(table.status),
]);

export const organization_billing = sqliteTable("organization_billing", {
	organization_id: text().primaryKey().references(() => organization.id, { onDelete: "cascade" } ),
	stripe_customer_id: text().unique(),
	stripe_subscription_id: text().unique(),
	payment_status: text().default("unknown").notNull(),
	paid_through: text(),
	past_due_since: text(),
	last_paid_invoice_id: text(),
	last_payment_event_created: integer(),
	last_payment_event_id: text(),
	access_plan: text().default("free").notNull(),
	access_expires_at: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	check("organization_billing_access_plan_check", sql`${table.access_plan} IN ('free', 'growth', 'managed', 'seo_accelerator')`),
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
	uniqueIndex("idx_onboarding_drafts_active_user_unique").on(table.user_id).where(sql`status = 'active'`),
	check("onboarding_drafts_status_check", sql`status IN ('active', 'committing', 'committed', 'failed')`),
	index("onboarding_drafts_user_id_idx").on(table.user_id),
]);

export const blog_posts = sqliteTable("blog_posts", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	slug: text().notNull(),
	excerpt: text(),
	category: text(),
	tags_json: text(),
	nav_section: text(),
	nav_title: text(),
	nav_order: integer(),
	nav_section_order: integer(),
	hide_from_nav: integer().default(0).notNull(),
	featured_order: integer(),
	status: text().default("published").notNull(),
	visibility: text().default("public").notNull(), // public | unlisted
	author_id: text().references(() => user.id, { onDelete: "set null" } ),
	published_at: text(),
	first_published_at: text(),
	scheduled_for: text(),
	slug_manually_overridden: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	seo_title: text(),
	seo_description: text(),
	seo_keywords: text(),
	canonical_url: text(),
	robots: text(),
}, (table) => [
	check("blog_posts_status_check", sql`status IN ('published', 'scheduled')`),
	check("blog_posts_visibility_check", sql`visibility IN ('public', 'unlisted')`),
	unique("blog_posts_site_slug_unique").on(table.site_id, table.slug),
	index("blog_posts_org_site_idx").on(table.organization_id, table.site_id),
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
}, (table) => [
	index("idx_platform_contact_submissions_status_created").on(table.status, table.created_at),
]);

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
	sort_order: integer().default(0),
	difficulty_level: text(),
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
	seo_title: text(),
	seo_description: text(),
	cta_type: text(),
	cta_url: text(),
	event_title: text(),
	event_start: text(),
	event_end: text(),
	offer_coupon: text(),
	offer_terms: text(),
	status: text().default("published").notNull(),
	scheduled_for: text(),
	published_at: text(),
	source: text().default("manual").notNull(),
	created_by: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	uniqueIndex("posts_site_slug_idx").on(table.site_id, table.slug),
	check("posts_status_check", sql`status IN ('published', 'scheduled')`),
	check("posts_source_check", sql`source IN ('manual', 'template')`),
	index("posts_org_site_idx").on(table.organization_id, table.site_id),
]);

export const rate_limits = sqliteTable("rate_limits", {
	key: text().primaryKey(),
	count: integer().default(0).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	expires_at: text(),
}, (table) => [
	index("idx_rate_limits_expires").on(table.expires_at),
]);

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
	uniqueIndex("booking_policies_reservation_location_unique").on(table.location_id).where(sql`policy_type = 'reservation' AND scope_type = 'location' AND location_id IS NOT NULL`),
	uniqueIndex("booking_policies_experience_site_unique").on(table.site_id).where(sql`policy_type = 'experience' AND scope_type = 'site'`),
	uniqueIndex("booking_policies_experience_location_unique").on(table.location_id).where(sql`policy_type = 'experience' AND scope_type = 'location' AND location_id IS NOT NULL`),
	uniqueIndex("booking_policies_experience_scope_unique").on(table.experience_id).where(sql`policy_type = 'experience' AND scope_type = 'experience' AND experience_id IS NOT NULL`),
	check("booking_policies_policy_type_check", sql`policy_type IN ('reservation', 'experience')`),
	check("booking_policies_scope_type_check", sql`scope_type IN ('site', 'location', 'experience')`),
	check("booking_policies_reservation_location_scope_check", sql`policy_type != 'reservation' OR (scope_type = 'location' AND location_id IS NOT NULL AND experience_id IS NULL)`),
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
	product_id: text(),
	author_name: text(),
	rating: integer().notNull(),
	title: text(),
	content: text(),
	google_review_id: text(),
	owner_reply: text(),
	owner_reply_at: text(),
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
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id, table.product_id],
		foreignColumns: [products.organization_id, products.site_id, products.location_id, products.id],
		name: "reviews_product_scope_fk",
	}).onDelete("restrict"),
	index("idx_reviews_request_id").on(table.review_request_id),
	index("idx_reviews_customer_id").on(table.customer_id),
	index("idx_reviews_location_status").on(table.location_id, table.status, table.created_at),
	index("idx_reviews_site_status").on(table.site_id, table.status, table.created_at).where(sql`location_id IS NULL`),
	index("idx_reviews_product_status_created").on(table.product_id, table.status, table.created_at),
	check("reviews_booking_type_check", sql`booking_type IS NULL OR booking_type IN ('reservation', 'experience_booking')`),
	check("reviews_rating_check", sql`rating BETWEEN 1 AND 5`),
	check("reviews_publication_authorized_check", sql`publication_authorized IN (0, 1)`),
	check("reviews_collection_method_check", sql`collection_method IS NULL OR collection_method IN ('in_person', 'email', 'phone', 'migration', 'other')`),
	check("reviews_product_scope_check", sql`product_id IS NULL OR (organization_id IS NOT NULL AND site_id IS NOT NULL AND location_id IS NOT NULL)`),
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

export const site_analytics_daily = sqliteTable("site_analytics_daily", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	date: text().notNull(),
	page_views: integer().default(0),
	unique_sessions: integer().default(0),
	avg_session_duration: integer().default(0),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	unique_visitors: integer().default(0),
	pages_per_session: real().default(0),
	returning_visitors: integer().default(0),
}, (table) => [
	unique("site_analytics_daily_site_id_date_unique").on(table.site_id, table.date),
	index("site_analytics_daily_organization_id_idx").on(table.organization_id),
]);

export const site_analytics_page_daily = sqliteTable("site_analytics_page_daily", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	date: text().notNull(),
	page_path: text().notNull(),
	page_views: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_analytics_page_daily_site_date_path_unique").on(table.site_id, table.date, table.page_path),
	index("site_analytics_page_daily_organization_id_idx").on(table.organization_id),
	index("site_analytics_page_daily_site_date_idx").on(table.site_id, table.date),
]);

export const site_analytics_dimension_daily = sqliteTable("site_analytics_dimension_daily", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	date: text().notNull(),
	dimension: text().notNull(),
	value: text().notNull(),
	subvalue: text().default("").notNull(),
	page_views: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_analytics_dimension_daily_site_date_value_unique").on(table.site_id, table.date, table.dimension, table.value, table.subvalue),
	check("site_analytics_dimension_daily_dimension_check", sql`${table.dimension} IN ('country', 'city', 'device', 'referrer')`),
	index("site_analytics_dimension_daily_organization_id_idx").on(table.organization_id),
	index("site_analytics_dimension_daily_site_date_idx").on(table.site_id, table.date),
]);

export const site_analytics_sessions = sqliteTable("site_analytics_sessions", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	session_id: text().notNull(),
	visitor_id: text().notNull(),
	started_at: text().notNull(),
	last_seen_at: text().notNull(),
	landing_path: text().notNull(),
	duration_seconds: integer().default(0).notNull(),
	last_touch_source: text().default("Direct").notNull(),
	last_touch_medium: text().default("(none)").notNull(),
	last_touch_campaign: text(),
	last_touch_term: text(),
	last_touch_content: text(),
	last_touch_referrer_host: text(),
	last_touch_gclid: text(),
	last_touch_gbraid: text(),
	last_touch_wbraid: text(),
	last_touch_fbclid: text(),
	last_touch_msclkid: text(),
	last_touch_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_analytics_sessions_site_session_unique").on(table.site_id, table.session_id),
	index("site_analytics_sessions_organization_id_idx").on(table.organization_id),
	index("site_analytics_sessions_site_started_idx").on(table.site_id, table.started_at),
	index("site_analytics_sessions_site_last_seen_idx").on(table.site_id, table.last_seen_at),
	index("site_analytics_sessions_site_visitor_started_idx").on(table.site_id, table.visitor_id, table.started_at),
	index("site_analytics_sessions_site_touch_started_idx").on(table.site_id, table.last_touch_source, table.last_touch_medium, table.started_at),
]);

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
	schema_type: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_path: text(),
	sort_order: integer().default(0).notNull(),
	featured: integer().default(0).notNull(),
	source: text().default("manual").notNull(),
	source_ref: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("offerings_organization_id_site_id_slug_unique").on(table.organization_id, table.site_id, table.slug),
	index("offerings_site_sort_idx").on(table.site_id, table.sort_order),
]);

export const tenant_pages = sqliteTable("tenant_pages", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	title: text().notNull(),
	slug: text(),
	page_type: text().default("custom").notNull(),
	recipe: text(),
	summary: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	sort_order: integer().default(0).notNull(),
	source: text().default("manual").notNull(),
	source_ref: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	index("tenant_pages_site_sort_idx").on(table.site_id, table.sort_order),
]);

export const site_link_pages = sqliteTable("site_link_pages", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ).unique(),
	path: text().default("/links").notNull(),
	title: text().notNull(),
	robots: text().default("noindex,follow").notNull(),
	seo_title: text(),
	seo_description: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("site_link_pages_organization_id_site_id_path_unique").on(table.organization_id, table.site_id, table.path),
	check("site_link_pages_path_check", sql`path LIKE '/%' AND path NOT LIKE '//%'`),
	check("site_link_pages_robots_check", sql`robots IN ('index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow')`),
]);

export const site_link_items = sqliteTable("site_link_items", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	link_page_id: text().notNull().references(() => site_link_pages.id, { onDelete: "cascade" } ),
	label: text().notNull(),
	destination: text().notNull(),
	sort_order: integer().default(0).notNull(),
	status: text().default("active").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	index("site_link_items_page_status_sort_idx").on(table.link_page_id, table.status, table.sort_order),
	index("site_link_items_site_idx").on(table.site_id),
	check("site_link_items_status_check", sql`status IN ('active', 'hidden')`),
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
	cta_label: text().notNull(),
	external_url: text(),
	schedule_path: text().notNull(),
	confirmation_path: text().notNull(),
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
	unique("site_redirects_site_locale_from_path_unique").on(table.site_id, table.locale, table.from_path),
	check("site_redirects_from_path_check", sql`from_path LIKE '/%'`),
	check("site_redirects_behavior_check", sql`behavior IN ('redirect', 'gone', 'noindex')`),
	check("site_redirects_redirect_to_path_check", sql`behavior != 'redirect' OR to_path IS NOT NULL`),
	check("site_redirects_owner_check", sql`(owner_type IS NULL AND owner_id IS NULL) OR (owner_type IS NOT NULL AND owner_id IS NOT NULL)`),
	index("site_redirects_organization_id_idx").on(table.organization_id),
	index("site_redirects_owner_idx").on(table.owner_type, table.owner_id),
]);

export const site_conversion_events = sqliteTable("site_conversion_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	event_name: text().notNull(),
	stage: text().notNull(),
	session_id: text().notNull(),
	visitor_id: text().notNull(),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	entity_type: text(),
	entity_id: text(),
	page_type: text(),
	page_path: text(),
	cta_destination: text(),
	source: text().default("Direct").notNull(),
	medium: text().default("(none)").notNull(),
	campaign: text(),
	term: text(),
	content: text(),
	referrer_host: text(),
	gclid: text(),
	gbraid: text(),
	wbraid: text(),
	fbclid: text(),
	msclkid: text(),
	attributed_at: text().notNull(),
	metadata_json: text(),
	ip_hash: text(),
	user_agent: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("site_conversion_events_site_created_idx").on(table.site_id, table.created_at),
	index("site_conversion_events_name_created_idx").on(table.event_name, table.created_at),
	index("site_conversion_events_session_idx").on(table.site_id, table.session_id),
	index("site_conversion_events_entity_idx").on(table.site_id, table.entity_type, table.entity_id),
	index("site_conversion_events_source_medium_created_idx").on(table.site_id, table.source, table.medium, table.created_at),
	uniqueIndex("site_conversion_events_entity_unique").on(table.site_id, table.event_name, table.entity_type, table.entity_id).where(sql`${table.entity_type} IS NOT NULL AND ${table.entity_id} IS NOT NULL AND ${table.event_name} IN ('contact_submit', 'reservation_submit', 'experience_booking_submit')`),
	check("site_conversion_events_name_check", sql`(event_name GLOB '[a-z]' OR event_name GLOB '[a-z][a-z0-9_]*') AND length(event_name) <= 64`),
	check("site_conversion_events_stage_check", sql`${table.stage} IN ('schedule_navigation', 'external_booking_handoff', 'submitted', 'external_handoff')`),
	index("site_conversion_events_organization_id_idx").on(table.organization_id),
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
	index("idx_site_domain_events_domain").on(table.domain_id, table.created_at),
	index("idx_site_domain_events_site").on(table.site_id, table.created_at),
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
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => [
	index("site_domains_org_site_idx").on(table.organization_id, table.site_id),
	uniqueIndex("idx_site_domains_one_canonical").on(table.site_id).where(sql`role = 'canonical' AND status = 'active'`),
	index("idx_site_domains_reconcile").on(table.status, table.next_check_at),
]);

export const spent_subdomains = sqliteTable("spent_subdomains", {
	domain: text().primaryKey(),
	site_id: text().notNull(),
	successor_domain: text(),
	spent_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("spent_subdomains_site_idx").on(table.site_id),
]);

export const organization_events = sqliteTable("organization_events", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().references(() => sites.id, { onDelete: "set null" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	actor_id: text().references(() => user.id, { onDelete: "set null" } ),
	event_type: text().notNull(),
	entity_type: text(),
	entity_id: text(),
	metadata: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("organization_events_org_created_idx").on(table.organization_id, table.created_at),
	index("organization_events_location_created_idx").on(table.location_id, table.created_at).where(sql`location_id IS NOT NULL`),
	index("organization_events_site_created_idx").on(table.site_id, table.created_at).where(sql`site_id IS NOT NULL`),
]);

export const site_locales = sqliteTable("site_locales", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	label: text(),
	is_source: numeric().default(sql`false`).notNull(),
	status: text().default("disabled").notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("site_locales_organization_id_site_id_locale_unique").on(table.organization_id, table.site_id, table.locale),
	uniqueIndex("idx_site_locales_one_source_per_site").on(table.organization_id, table.site_id).where(sql`is_source = 1`),
	check("site_locales_status_check", sql`status IN ('published', 'disabled') AND (is_source = 0 OR status = 'published')`),
	check("site_locales_english_source_check", sql`locale <> 'en' OR (is_source = 1 AND status = 'published')`),
]);

export const platform_locale_catalogs = sqliteTable("platform_locale_catalogs", {
	locale: text().primaryKey(),
	label: text().notNull(),
	direction: text().notNull(),
	status: text().default("unavailable").notNull(),
	source_manifest_hash: text(),
	available_at: text(),
	available_by_user_id: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by_user_id: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by_user_id: text().notNull(),
}, (table) => [
	check("platform_locale_catalogs_direction_check", sql`${table.direction} IN ('ltr', 'rtl')`),
	check("platform_locale_catalogs_status_check", sql`${table.status} IN ('unavailable', 'available')`),
]);

export const platform_locale_messages = sqliteTable("platform_locale_messages", {
	locale: text().notNull().references(() => platform_locale_catalogs.locale, { onDelete: "cascade" }),
	message_key: text().notNull(),
	message_value: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by_user_id: text().notNull(),
}, (table) => [
	primaryKey({ columns: [table.locale, table.message_key] }),
]);

export const site_language_licenses = sqliteTable("site_language_licenses", {
	id: text().primaryKey(),
	organization_id: text().notNull(),
	site_id: text().notNull(),
	locale: text().notNull(),
	stripe_subscription_id: text(),
	stripe_subscription_item_id: text(),
	status: text().default("disabled").notNull(),
	operation_id: text(),
	provider_idempotency_key: text(),
	last_provider_quantity: integer(),
	last_error_code: text(),
	activated_at: text(),
	disabled_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	foreignKey({
		columns: [table.organization_id, table.site_id, table.locale],
		foreignColumns: [site_locales.organization_id, site_locales.site_id, site_locales.locale],
		name: "site_language_licenses_site_locale_fk",
	}).onDelete("cascade"),
	unique("site_language_licenses_org_site_locale_unique").on(table.organization_id, table.site_id, table.locale),
	check("site_language_licenses_status_check", sql`${table.status} IN ('enabling', 'active', 'disabling', 'disabled')`),
	check("site_language_licenses_non_english_check", sql`${table.locale} <> 'en'`),
	index("site_language_licenses_organization_status_idx").on(table.organization_id, table.status),
	index("site_language_licenses_subscription_item_idx").on(table.stripe_subscription_item_id),
]);

export const site_pageview_events = sqliteTable("site_pageview_events", {
	id: text().primaryKey(),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().references(() => business_locations.id, { onDelete: "set null" } ),
	page_path: text().notNull(),
	page_id: text(),
	page_type: text(),
	recipe: text(),
	locale: text(),
	revision_id: text(),
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
	index("idx_pageview_events_session").on(table.site_id, table.session_id),
	index("idx_pageview_events_site_visitor").on(table.site_id, table.visitor_id),
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
	index("idx_mcp_tool_call_events_created_at").on(table.created_at),
	index("idx_mcp_tool_call_events_tool_status").on(table.tool_name, table.status),
	index("idx_mcp_tool_call_events_site").on(table.site_id, table.created_at),
	index("idx_mcp_tool_call_events_org").on(table.organization_id, table.created_at),
	index("idx_mcp_tool_call_events_method_created").on(table.method, table.created_at),
	index("idx_mcp_tool_call_events_session").on(table.session_id_hash, table.created_at),
	index("idx_mcp_tool_call_events_unknown").on(table.unknown_tool_name, table.created_at),
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
	uniqueIndex("idx_site_transfer_pending").on(table.site_id).where(sql`status = 'pending'`),
	index("idx_site_transfer_reminders").on(table.status, table.requires_payment, table.created_at),
	index("idx_site_transfer_site").on(table.site_id, table.status),
	uniqueIndex("idx_site_transfer_token").on(table.token),
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
	contact_email: text(),
	contact_phone: text(),
	default_currency: text().default("THB").notNull(),
	status: text().default("active"),
	onboarding_status: text().default("pending"),
	url_structure: text().default("location_subdirectories").notNull(),
	vertical: text().default("restaurant").notNull(),
	last_published_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
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
	check("sites_status_check", sql`${table.status} IN ('active', 'inactive', 'suspended')`),
	check("sites_onboarding_status_check", sql`${table.onboarding_status} IN ('pending', 'active', 'failed')`),
	check("sites_url_structure_check", sql`${table.url_structure} IN ('location_subdirectories', 'brand_pages')`),
	check("sites_vertical_check", sql`${table.vertical} IN ('restaurant', 'experience', 'retail', 'wellness', 'service')`),
	check("sites_default_currency_check", sql`${table.default_currency} IN ('THB','USD','EUR','GBP','JPY','AUD','CAD','SGD','HKD','MYR','IDR','PHP','VND','INR')`),
	uniqueIndex("idx_sites_custom_domain_unique").on(table.custom_domain).where(sql`custom_domain IS NOT NULL`),
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
	claimed_at: text(),
	lease_expires_at: text(),
	claim_token: text(),
	next_attempt_at: text(),
	dead_lettered_at: text(),
	attempt_count: integer().default(0).notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	index("stripe_webhook_events_retry_idx").on(table.status, table.next_attempt_at),
]);

export const stripe_subscription_versions = sqliteTable("stripe_subscription_versions", {
	stripe_subscription_id: text().primaryKey(),
	last_event_created: integer().notNull(),
	last_event_id: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
});

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
	ga4_purchase_status: text().default("pending"),
	ga4_purchase_event_id: text(),
	ga4_purchase_attempt_count: integer().default(0).notNull(),
	ga4_purchase_claimed_at: text(),
	ga4_purchase_sent_at: text(),
	ga4_purchase_error: text(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
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
	index("stripe_ga4_subscription_intents_subscription_idx").on(table.stripe_subscription_id, table.status, table.created_at),
	index("stripe_ga4_subscription_intents_organization_idx").on(table.organization_id, table.status, table.created_at),
	index("stripe_ga4_subscription_intents_expiry_idx").on(table.status, table.expires_at),
	check("stripe_ga4_subscription_intents_action_check", sql`${table.action} IN ('initial_subscription', 'upgrade', 'downgrade')`),
	check("stripe_ga4_subscription_intents_status_check", sql`${table.status} IN ('pending', 'consumed', 'expired')`),
	check("stripe_ga4_subscription_intents_timing_check", sql`${table.effective_timing} IN ('immediate', 'period_end')`),
]);

// Better Auth's organization subscription is the control-plane billing authority.
// `organization_billing` is slim sessionless access evidence, never an independent
// authority. usage_events (append-only ledger) and
// usage_quota_grants (plan/reset/manual grants, also append-only) are the only
// writers of consumption and allowance history — no one-time credit purchase,
// service-addon, or auto-top-up writer exists; that product model was removed
// after a production census found no customer purchase/fulfillment history for it.
// Starter = 500 shared usage credits/UTC week, Growth = 2,000/UTC week (Monday
// 00:00:00 UTC boundary); a `plan` grant is the exact base allowance for that week,
// not additive, and never carries over. `manual` grants are additive within their
// declared week only; a `reset` grant sets the exact remaining balance for its week
// without rewriting earlier grants/usage. See server/utils/quota-adjustment.ts for
// the dry-run/approved-apply operator path (never hand-edit these tables directly).
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
	unique("usage_events_organization_id_idempotency_key_unique").on(table.organization_id, table.idempotency_key),
	index("usage_events_organization_resource_created_idx").on(table.organization_id, table.resource, table.created_at),
	index("usage_events_site_created_idx").on(table.site_id, table.created_at),
]);

export const usage_quota_grants = sqliteTable("usage_quota_grants", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	resource: text().notNull(),
	quantity: integer().notNull(),
	unit: text().notNull(),
	period_key: text().notNull(),
	period_start: text().notNull(),
	period_end: text(),
	grant_type: text().notNull(),
	reason: text().notNull(),
	created_by: text().references(() => user.id, { onDelete: "set null" } ),
	idempotency_key: text().notNull(),
	applied_at: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("usage_quota_grants_organization_id_idempotency_key_unique").on(table.organization_id, table.idempotency_key),
	index("usage_quota_grants_active_idx").on(table.organization_id, table.resource, table.period_start, table.period_end),
]);

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
	index("idx_work_requests_org").on(table.organization_id, table.status, table.created_at),
	index("idx_work_requests_status").on(table.status, table.priority, table.created_at),
]);

export const experiences = sqliteTable("experiences", {
	id: text().primaryKey().references(() => products.id, { onDelete: "cascade" }),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	location_id: text().notNull().references(() => business_locations.id, { onDelete: "cascade" } ),
	tagline: text(),
	pricing_note: text(),
	duration_minutes: integer(),
	max_capacity: integer(),
	time_slots: text(),
	recurring_slots: text(),
	available_note: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	highlights: text(),
	included_items: text(),
	what_to_bring: text(),
	meeting_point: text(),
	cancellation_policy: text(),
}, (table) => [
	foreignKey({
		columns: [table.organization_id, table.site_id, table.location_id, table.id],
		foreignColumns: [products.organization_id, products.site_id, products.location_id, products.id],
		name: "experiences_product_scope_fk",
	}).onDelete("cascade"),
	index("experiences_org_site_idx").on(table.organization_id, table.site_id),
	uniqueIndex("experiences_org_site_id_unique").on(table.organization_id, table.site_id, table.id),
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

export const content_documents = sqliteTable("content_documents", {
	id: text().primaryKey(),
	owner_type: text().notNull(),
	owner_id: text().notNull(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
}, (table) => [
	unique("content_documents_owner_unique").on(table.owner_type, table.owner_id),
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
	document_id: text().references(() => content_documents.id),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	created_by_user_id: text().notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by_user_id: text().notNull(),
}, (table) => [
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
	check("resource_localizations_values_json_check", sql`json_valid(${table.values_json}) AND json_type(${table.values_json}) = 'object'`),
	check("resource_localizations_non_english_check", sql`${table.locale} <> 'en'`),
	check("resource_localizations_route_path_check", sql`${table.route_path} IS NULL OR (${table.route_path} LIKE '/' || ${table.locale} || '/%' AND ${table.route_path} NOT LIKE '%?%' AND ${table.route_path} NOT LIKE '%#%' AND ${table.route_path} NOT LIKE '%//%')`),
	index("resource_localizations_site_locale_type_idx").on(table.site_id, table.locale, table.resource_type),
	index("resource_localizations_resource_idx").on(table.resource_type, table.resource_id),
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
	index("content_blocks_document_position_idx").on(table.document_id, table.position),
	index("content_blocks_parent_idx").on(table.parent_block_id),
]);

export const tenant_page_variants = sqliteTable("tenant_page_variants", {
	id: text().primaryKey(),
	organization_id: text().notNull().references(() => organization.id, { onDelete: "cascade" } ),
	site_id: text().notNull().references(() => sites.id, { onDelete: "cascade" } ),
	page_id: text().notNull().references(() => tenant_pages.id, { onDelete: "cascade" } ),
	locale: text().notNull(),
	document_id: text().notNull().references(() => content_documents.id, { onDelete: "cascade" } ),
	path: text().notNull(),
	title: text().notNull(),
	summary: text(),
	seo_title: text(),
	seo_description: text(),
	canonical_url: text(),
	robots: text(),
	created_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_at: text().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
	updated_by: text(),
}, (table) => [
	unique("tenant_page_variants_page_locale_unique").on(table.page_id, table.locale),
	unique("tenant_page_variants_site_locale_path_unique").on(table.site_id, table.locale, table.path),
	index("tenant_page_variants_site_path_idx").on(table.site_id, table.path),
	index("tenant_page_variants_page_idx").on(table.page_id),
	check("tenant_page_variants_path_check", sql`path LIKE '/%' AND path NOT LIKE '//%'`),
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
	index("public_resource_cache_invalidations_status_idx").on(table.status, table.created_at),
	index("public_resource_cache_invalidations_site_idx").on(table.site_id, table.status),
]);
