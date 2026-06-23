-- Migration number: 0009 	 2026-06-23T12:31:03.445Z

-- Originally implemented by adding 'delete_pending' to media_assets.status's
-- CHECK constraint via a rename/recreate/drop table rebuild. That approach is
-- unsafe in D1: D1 always enforces foreign keys (PRAGMA foreign_keys=OFF and
-- legacy_alter_table=ON are both silently ignored), and sites.logo_asset_id/
-- og_image_asset_id and experiences.image_asset_id/video_asset_id hold live,
-- non-null FK rows pointing at media_assets in any real environment — the
-- rebuild's DROP TABLE step would throw a FOREIGN KEY constraint violation
-- and roll back the whole migration. (It only appeared to work in early
-- testing because the local dev DB had zero rows in those tables.)
--
-- Adding a plain column avoids ever renaming or dropping media_assets, so it
-- never touches the FK graph at all.
ALTER TABLE media_assets ADD COLUMN delete_pending_at TEXT;
