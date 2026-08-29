# Database epoch 2 reset

This document records the schema audit and repeatable epoch-1 to epoch-2 data move. Epoch 2 starts on new D1 database IDs; `0000_epoch_2_baseline.sql` must never be applied to an epoch-1 database.

## Recorded starting point

- `main`: `846aa1420063637a530a08873ca6d4fa150cef98`
- `staging`: `846aa1420063637a530a08873ca6d4fa150cef98`
- Production: `krabiclaw-db` (`0d0cd133-1914-48b1-b010-8fe574fede0c`)
- Staging: `krabiclaw-db-staging` (`b6e29548-155d-43ce-81ba-f6f6c5473069`)
- Preview: `krabiclaw-db-preview` (`abda2264-f84f-4cc7-8483-930fe9fc288d`)
- All Worker environments bind D1 as `DB` and use `migrations_dir = "migrations"`.

Epoch-2 resources created in APAC on 2026-08-29:

- Production: `krabiclaw-db-epoch2` (`81f0e392-e7a1-4602-8ae9-7df87fc66868`)
- Staging: `krabiclaw-db-staging-epoch2` (`688c419a-5bcd-4eaf-b008-50d68a7d453f`)
- Preview: `krabiclaw-db-preview-epoch2` (`1313d772-20cd-44cf-8f31-60df1148b41a`)

Production was exported outside Git before the active migration tree was changed. The full, schema-only, and data-only exports are private operator artifacts and must not be committed.

## Target inventory

All 113 application tables present in production are KEEP and are represented by `server/db/schema.ts`.

- Identity and authorization: `account`, `invitation`, `jwks`, `member`, `oauthAccessToken`, `oauthClient`, `oauthClientAssertion`, `oauthClientResource`, `oauthConsent`, `oauthRefreshToken`, `oauthResource`, `organization`, `session`, `team`, `teamMember`, `user`, `verification`.
- Tenant, site, and configuration: `business_locations`, `dashboard_preferences`, `onboarding_drafts`, `site_config`, `site_consultation_settings`, `site_domains`, `site_entitlements`, `site_events`, `site_link_items`, `site_link_pages`, `site_redirects`, `site_theme_tokens`, `site_transfer_requests`, `sites`, `spent_subdomains`, `tenant_compliance`, `themes`, `work_requests`.
- Content and localization: `blog_posts`, `client_import_artifacts`, `content_blocks`, `content_documents`, `location_qa`, `platform_blog_redirects`, `platform_content`, `platform_docs`, `platform_locale_catalogs`, `platform_locale_messages`, `post_channel_jobs`, `posts`, `public_resource_cache_invalidations`, `resource_localizations`, `site_language_licenses`, `site_locales`, `tenant_page_variants`, `tenant_pages`.
- Products, bookings, reviews, and customers: `booking_policies`, `contact_submissions`, `customer_claims`, `customers`, `experience_bookings`, `experience_slot_overrides`, `experiences`, `offerings`, `products`, `reservation_slot_overrides`, `reservation_submissions`, `review_requests`, `reviews`.
- Media and messaging: `chowbot_channel_state`, `chowbot_conversations`, `chowbot_messages`, `guest_thread_commands`, `guest_thread_deliveries`, `guest_thread_entries`, `guest_thread_member_state`, `guest_thread_outbox`, `guest_thread_sequence_counters`, `guest_threads`, `media_assets`, `media_placements`, `notification_deliveries`, `notification_events`, `notification_reads`, `notifications`.
- Billing and usage: `ai_credits`, `ai_usage_log`, `organization_billing`, `organization_entitlements`, `site_billing`, `stripe_ga4_subscription_intents`, `stripe_invoice_payments`, `stripe_subscription_versions`, `stripe_webhook_events`, `subscription`, `usage_events`, `usage_quota_grants`.
- Analytics, operations, and integrations: `canary_runs`, `domain_reconciliation_jobs`, `facebook_pages_connections`, `google_analytics_connections`, `google_place_snapshots`, `mcp_tool_call_events`, `mcp_workspace_preferences`, `platform_analytics`, `platform_contact_submissions`, `platform_pageview_events`, `rate_limits`, `site_analytics_daily`, `site_analytics_dimension_daily`, `site_analytics_page_daily`, `site_analytics_sessions`, `site_conversion_events`, `site_domain_events`, `site_pageview_events`, `zaraz_sync_lock`.

`d1_migrations` is Cloudflare's ledger, not an application table. Epoch 2 creates it only through `wrangler d1 migrations apply`.

## Production versus canonical schema

The audit materialized the production schema export and a fresh Drizzle generation into separate SQLite databases and compared tables, columns, primary keys, foreign keys, indexes, checks, and triggers.

- Table names match exactly after excluding production's `d1_migrations` ledger.
- Epoch 2 makes text primary keys explicitly `NOT NULL`, restores the missing `(user_id, channel)` primary key on `chowbot_channel_state`, and makes `organization.slug` non-null and non-blank.
- `blog_posts.status` and `posts.status` default to `published`, consistent with their current checks and all production rows. The epoch-1 physical defaults were stale `draft` defaults.
- `chowbot_channel_state.pending_message_id` uses `ON DELETE SET NULL` in the canonical schema; epoch 1 still had `NO ACTION`.
- Cross-scope ChowBot and Product Review ownership is represented with composite foreign keys and supporting unique constraints rather than triggers.
- Media category, video thumbnail, publication status, organization slug, locale, and supported-currency rules are ordinary Drizzle check constraints rather than paired insert/update triggers.
- Production's required query indexes were moved into `schema.ts`. Redundant duplicate indexes were not copied merely because epoch 1 contained them.
- Boolean default spellings such as `1` versus `true` and SQLite affinity spellings such as `BOOLEAN` versus `numeric` are semantically equivalent and do not require data transforms.

The pre-reset production snapshot contained 34,286 rows across 113 application tables, 87 of them non-empty. It had no foreign-key violations, no nulls in newly required fields, no duplicate ChowBot state keys, and no Product Review scope violations.

## Custom SQL objects

The only intentional non-Drizzle object is `trg_prune_rate_limits`, appended to the generated baseline. It probabilistically removes expired rate-limit rows after inserts. The deterministic data importer temporarily drops this trigger and restores the exact baseline definition after loading, so importing historical rows cannot randomly change the copied primary-key set. All other epoch-1 triggers were replaced by schema checks or foreign keys.

There are no views or virtual tables in the epoch-2 target.

## Data movement classification

All 113 application tables are COPY DIRECTLY. Cloudflare's data-only export includes explicit column names, so physical column-order differences do not require transforms.

The one-time preparation step removes only:

- inserts into epoch 1's `d1_migrations` ledger;
- the derived `sqlite_sequence` row.

No business row, identifier, Better Auth record, tenant record, content record, billing record, or media reference is transformed or dropped. `scripts/epoch2-data.mjs` prepares the import and verifies row counts, exact primary-key sets, and foreign keys against local epoch-1 and epoch-2 SQLite files.

## Obsolete epoch-1 objects

- All epoch-1 migration SQL and Drizzle metadata.
- The epoch-1 `d1_migrations` ledger in data exports.
- Twenty-six value/scope triggers now represented by canonical checks or foreign keys.
- Duplicate and superseded query indexes not justified by the current schema and runtime.

The old production D1 resource remains untouched as the rollback database until epoch 2 is verified.

## Clean baseline procedure

1. Start from a clean reset branch created from `staging` and record the branch commits and D1 IDs.
2. Export production outside Git with current Wrangler: full, `--no-data`, and `--no-schema` variants.
3. Audit `server/db/schema.ts`, the production schema export, and runtime reads/writes. Fix the canonical schema before generating SQL.
4. Remove every file under `migrations/`, including `migrations/meta/`; do not retain an empty `meta` directory.
5. Run the repository-pinned generator: `yarn drizzle-kit generate --name=epoch_2_baseline`.
6. Inspect the generated SQL, then append the documented `trg_prune_rate_limits` custom trigger to that same baseline file.
7. Apply the baseline to an absolutely empty local database and run `PRAGMA foreign_key_check`.
8. Prepare a data-only import with `yarn db:epoch2:prepare <data-export.sql> <epoch2-data.sql>`.
9. Import into a fresh epoch-2 candidate and run `yarn db:epoch2:verify <epoch1.sqlite> <epoch2.sqlite>`.
10. Run `yarn drizzle-kit generate` again without changing `schema.ts`. It must report no schema changes and create no second migration.
11. Create new remote D1 resources, apply only the baseline with native `wrangler d1 migrations apply`, and confirm their `d1_migrations` ledger contains only `0000_epoch_2_baseline.sql`.

Never rewrite migrations for an active D1 database ID. A future squash requires a new database epoch and an explicit data migration, as was done for epoch 2.
