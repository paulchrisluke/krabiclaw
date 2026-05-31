-- Add video and images support to experiences table

ALTER TABLE experiences ADD COLUMN video_asset_id TEXT;
ALTER TABLE experiences ADD COLUMN images TEXT;
