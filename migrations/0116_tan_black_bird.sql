UPDATE `media_assets`
SET `cloudflare_image_id` = substr(
	`thumbnail_url`,
	length('https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/') + 1,
	instr(substr(`thumbnail_url`, length('https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/') + 1), '/') - 1
)
WHERE `provider` = 'cloudflare_r2'
	AND `kind` = 'video'
	AND `cloudflare_image_id` IS NULL
		AND instr(`thumbnail_url`, 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/') = 1
		AND instr(substr(`thumbnail_url`, length('https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/') + 1), '/') > 1;--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `delete_pending_at`;
