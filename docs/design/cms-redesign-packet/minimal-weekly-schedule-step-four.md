# Minimal weekly scheduling — approved simplification

Owner approved Product duration/capacity plus weekly weekday/time/location/timezone, including removal of per-slot capacity. Base: reviewed PR1217, corrected future-session regression head `3c7791d3319a0634da9433ad115e8fe3e7cf14a5`. This slice prepares a forward migration and rehearses it locally. It authorizes no remote DDL, data deletion, deployment or merge.

## Fresh evidence and mapping

Supported `scripts/pull-production-snapshot.ts --out ...` SELECT-only preflight ran against the configured production `krabiclaw-production-v7` and explicitly named `krabiclaw-staging-v7`. Both completed with **Transforms: no changes**, valid schema/invariants, and no remote writes. Snapshots were read through SQLite `mode=ro`, and restored into isolated local D1 via Wrangler. No customer identifiers or raw provider/customer data are in this report.

| Fresh snapshot | Production | Staging |
| --- | ---: | ---: |
| Local snapshot completed copying, UTC, 2026-10-01 | 12:55:23 | 12:55:24 |
| Total retained rows / tables | 71,369 / 67 | 69,610 / 67 |
| Rules / Product booking configs | 131 / 11 | 131 / 11 |
| Sessions / Bookings | 960 / 3 | 939 / 3 |
| Sessions with Booking history | 3 | 3 |
| Populated end_time / interval_minutes | 0 / 0 | 0 / 0 |
| Nonweekly cadence / start window / end window | 0 / 0 / 0 | 0 / 0 / 0 |
| Rule duration override / capacity override | 0 / 0 | 0 / 0 |
| Duplicate simplified slot-key groups | 0 | 0 |
| Missing rule references / FK violations | 0 / 0 | 0 / 0 |

Snapshot SHA256 (restricted local backup files, not committed):

- Production `/tmp/task10-step4-production.sqlite`: `765f1448f25346b875679b4b6beb6fd1d7523d2279b3d22d1eaea8f8077af28d`.
- Staging `/tmp/task10-step4-staging.sqlite`: `3828a0e3e145accffe65d6b752cf765981550fc22310758b1190dd70c84e2c16`.

All observed rules map losslessly: retain ID, organization/product, nullable location, timezone, weekday/local start, and audit fields; discard only null unused fields and weekly cadence value 1. **Every Session and Booking row, ID, actual fact and source occurrence key stays untouched.** This is no evidence that all configurations represent organic use; the earlier inventory found sparse booking history and manual provenance that cannot distinguish fixtures from owner input.

## Actual deletion and contracts

`server/db/schema.ts` removes seven rule columns: `end_time`, `interval_minutes`, `interval_weeks`, `effective_from_date`, `effective_until_date`, rule `duration_minutes`, rule `capacity`; their dependent checks disappear coherently. Both partial slot uniqueness indexes retain the nullable-location distinction and omit cadence. `(organization_id,id)` uniqueness and Session rule-scope foreign key remain. Baseline and archived schema files are unchanged; metadata records canonical forward migration `0003_minimal_weekly_schedule.sql`.

`server/utils/availability.ts` reads and generates simple weekly slots using Product defaults. The shared writer accepts only `{weekday,start_time}` and rejects retired override/window/cadence inputs explicitly instead of ignoring them. `components/dashboard/ProductEditorPage.vue`, the booking leaf, the HTTP contract, MCP schema/catalog and feature evidence agree. Product null/zero semantics and all saved Session history guards remain. Old callers sending per-slot capacity now get an explicit error; this intentional approved removal applies to the unmerged Step 2 wrapper too. No compatibility shadow owner is introduced.

Separate restaurant Reservations, Product→Variant→Price→Session→Booking, billing/seller/catalog mappings, rich service pages and immutable financial snapshots remain. Nullable-location online NCLS rules remain legal. Future native member availability/eligibility/assignment stays separate from Product weekly defaults and uses the existing identity/membership foundation; no provider/member fields, Clio adapter or calendar_group reinterpretation is added. The requirements decision concerns replacing Clio Grow scheduling with native booking/messaging, not a committed API integration or full CRM (coordinating review of PR1201/PR1203 and consultation requirements).

## Migration strategy, proof and release blocker

The sole inbound FK to rules is `product_sessions_rule_scope_fk`, `NO ACTION`. An actual disposable D1 proof showed deferred replacement preserves its child and grandchild. The forward migration runs in one D1 transaction: a transient CHECK guard fails on any populated retired field; create/copy retained rule columns; drop/recreate the same rule-table name with `PRAGMA defer_foreign_keys=ON`; restore both slot indexes and organization/ID uniqueness; turn deferred checks off. New-table uniqueness also rejects collisions atomically. No Session/Booking UPDATE, DELETE, regeneration, detachment or table rebuild appears in this migration. Transient guard/copy tables disappear in the completed transaction; the persistent table count remains 67.

The repository migration linter now permits only this named migration's deferred rule-table replacement when every inbound reference is NO ACTION. It continues rejecting cascading, SET NULL and RESTRICT parent drops, replays transactions with foreign keys enabled, and checks FKs afterward. Archived transfer paths apply this same guarded migration before column projection; they cannot silently lose populated legacy values.

Full production and staging clones were restored through local Wrangler D1 execution. After migration, SHA256 comparisons of **all retained columns in every one of 67 tables** matched their fresh source snapshots, including all rule IDs, all Session facts, every Booking link, and all unrelated customer/financial data. Counts were 71,369 and 69,610 respectively; `foreign_key_check` returned zero and `integrity_check` was `ok`. Local restore/application/evidence logs and aggregate digest manifests are `/tmp/task10-step4-{production,staging}-*.log` and `*-retained-proof.json`. These were local D1 rehearsals, not remote applications.

**Do not merge into a deploying branch yet.** `.github/workflows/ci.yml` applies migrations before Worker deployment. The older Worker reads the retired columns, so automatic migration-first rollout breaks it. New code is compatible with the old schema (actual D1 test), permitting an owner-approved **code-first deployment without contraction**, then a fresh read-only preflight, retained verified backup and provider recovery bookmark, then separately approved schema contraction. Confirm older Workers/jobs/clients no longer depend on retired fields and coordinate writes before that contraction. No CI exception, production deployment, recovery bookmark or production DDL is claimed here. The owner approved the model/preparation; irreversible column/data deletion and this deployment-order exception require later explicit approval. No new shadow columns/tables or unrelated rebaseline is required.

## Validation and references

Twelve actual D1 cases pass, including normal replay/DST, cross-location and neutral generation, null/zero Product defaults, concurrency, cancelled/edited/moved history, retained unbooked behavior, migration identity/FK preservation, and rollback for every populated retired-field case. Focused migration cases were rerun after final statement boundaries and code-before-DDL compatibility assertion. Three production-build Worker cases pass (HTTP↔MCP parity including retired-input rejection, six-seat booked-history proof, public booking). The history case also opens the actual CMS booking editor and asserts Product defaults, one weekly time input, and no per-time capacity input; screenshot `/tmp/task10-minimal-weekly-slots.png` was visually inspected.

Required quality, build, migration lint, canonical schema/metadata drift, migration-chain/archive transfer tests, generated catalog/submission checks, focused test lint and zero direct focused TypeScript diagnostics pass. Nuxt's normal typecheck excludes tests. Existing Q&A harness typing limitations from Step 2 remain outside this patch. Independent review remains with the coordinating task; no repeated full-suite/review rounds were launched.

Primary implementation references: `server/db/schema.ts` (`product_availability_rules`, unchanged Session rule FK), `server/utils/availability.ts`, `components/dashboard/ProductEditorPage.vue`, `server/utils/mcp-tools/products.ts`, `migrations/0003_minimal_weekly_schedule.sql`, `scripts/lint-migrations.mjs`, `scripts/transfer-database-export.mjs`, `tests/integration/availability-d1.test.ts`, `tests/e2e/mcp-owner-tools.spec.ts`. Archived recurrence references remain only in historical migrations/fixture SQL and historical design evidence. The earlier airbnb handoff and Step 3 inventory are context; this approved model supersedes their unused-rule-layer descriptions.

Cloudflare's current [foreign-key documentation](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) supports deferred constraint checks and explains why CASCADE actions still need protection. Actual local D1 results above establish this migration's behavior; documentation alone is not the preservation proof.
