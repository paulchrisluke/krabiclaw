# ADR 0016: Protect media relationships during D1 migrations

## Decision

KrabiClaw must not rebuild the `media_assets` parent table with `DROP TABLE`. Migration commands run `scripts/check-migration-safety.mjs` before Wrangler and fail when a new migration contains that destructive pattern. Constraints that can be expressed additively use triggers; migration `0048_media_assets_category_guard.sql` enforces the media category vocabulary without replacing the table.

## Context

On 2026-07-15, generated migration `0047_free_molecule_man.sql` copied and dropped `media_assets`. In production, dropping the parent activated `ON DELETE SET NULL` relationships across sites, blog posts, offerings, experiences, menu items, and posts. Media records and files survived, but their references were cleared. D1 Time Travel restored the database to the bookmark immediately before the migration, and post-incident MCP edits were replayed from a damaged-state export.

The migration included `PRAGMA foreign_keys=OFF`, but that did not prevent D1 from applying foreign-key delete actions. Its presence is not a safety mechanism for parent-table replacement.

The rebuild also removed the `sync_media_assets_old_insert`, `sync_media_assets_old_update`, and `sync_media_assets_old_delete` triggers. `media_assets_old` is not inert migration debris: several historical foreign keys still use it as their compatibility parent. After production recovery restored the records and references, fresh preview, staging, and local seeds could still fail because newly inserted canonical assets were no longer mirrored before those legacy relationships were assigned.

## Consequences

- Previously applied migration filenames remain immutable, including `0047`.
- Production records `0047` as applied after recovery so it cannot rerun.
- Category validation is enforced with insert/update triggers in `0048`, which is safe on both the restored production schema and environments where `0047` already rebuilt the table.
- `media_assets_old` remains live compatibility infrastructure until every foreign key that references it has been migrated additively.
- Migration `0050_restore_media_assets_legacy_sync.sql` backfills the compatibility parent and restores the three canonical-to-compatibility sync triggers.
- Any migration that affects `media_assets` must verify that all three sync triggers still exist. Preserving table data alone is insufficient.
- Schema and seed verification must insert an asset into `media_assets`, confirm its mirror in `media_assets_old`, and assign that asset through a real legacy foreign key.
- Future protected parent tables must be added to the migration safety checker before they acquire widespread foreign-key consumers.
- Recovery requires a current export, a pre-incident Time Travel bookmark, selective replay of legitimate later writes, and `PRAGMA foreign_key_check` verification.
- When the staging path filter selects the Blawby suite, CI runs the NCLS fixture generator with the explicit `--staging` target before deployment. The generator continues to reject bare `--remote`, which targets production; staging uses test identities and is reset with the other E2E fixtures.
