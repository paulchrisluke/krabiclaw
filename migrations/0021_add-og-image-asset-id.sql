-- Migration number: 0021 	 2026-06-19T06:00:34.011Z
ALTER TABLE sites ADD COLUMN og_image_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL;
