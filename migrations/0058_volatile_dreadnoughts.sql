ALTER TABLE `oauthClient` ADD `scopesJson` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `oauthClient`
SET `scopesJson` = CASE
	WHEN json_valid(`scopes`) AND json_type(`scopes`) = 'array' THEN `scopes`
	ELSE '[]'
END;
