UPDATE media_assets
SET cloudflare_image_id = '1186bd99-f52b-4075-4d02-ca0031c75e00',
    thumbnail_url = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1186bd99-f52b-4075-4d02-ca0031c75e00/public',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'media-demo-hero-video' AND site_id = 'site-demo' AND kind = 'video';
--> statement-breakpoint
UPDATE media_assets
SET cloudflare_image_id = '5c517683-419a-47f4-a463-7c287991e400',
    thumbnail_url = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/5c517683-419a-47f4-a463-7c287991e400/public',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'media-demo-margherita-video' AND site_id = 'site-demo' AND kind = 'video';
--> statement-breakpoint
UPDATE media_assets
SET cloudflare_image_id = '2ebbddca-348d-4409-a411-17a003e1a500',
    thumbnail_url = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/2ebbddca-348d-4409-a411-17a003e1a500/public',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'media-demo-pizza-prep-video' AND site_id = 'site-demo' AND kind = 'video';
--> statement-breakpoint
UPDATE media_assets
SET cloudflare_image_id = '4455930f-af88-4428-d41c-5509bbac8600',
    thumbnail_url = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/4455930f-af88-4428-d41c-5509bbac8600/public',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'media-kiku-location-hero-video' AND site_id = 'site-kikuzuki' AND kind = 'video';
--> statement-breakpoint
UPDATE media_assets
SET cloudflare_image_id = 'd60be1d6-8a9e-4382-e01f-e39cd247e700',
    thumbnail_url = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/d60be1d6-8a9e-4382-e01f-e39cd247e700/public',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = '06a5af78-9c93-47f3-a8e4-2744a1f4f29a' AND site_id = 'site-pottery-house' AND kind = 'video';
--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_insert
BEFORE INSERT ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;
--> statement-breakpoint
CREATE TRIGGER media_assets_video_thumbnail_update
BEFORE UPDATE OF kind, thumbnail_url ON media_assets
WHEN NEW.kind = 'video' AND (NEW.thumbnail_url IS NULL OR length(trim(NEW.thumbnail_url)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'video assets require thumbnail_url');
END;
