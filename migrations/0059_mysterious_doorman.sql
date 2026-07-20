PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauthAccessToken` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text,
	`token` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`authorizationCodeId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`sessionId` text,
	`referenceId` text,
	`refreshId` text,
	`revoked` integer,
	`confirmation` text
);
--> statement-breakpoint
INSERT INTO `__new_oauthAccessToken`("id", "clientId", "userId", "token", "scopes", "authorizationCodeId", "resources", "requestedUserInfoClaims", "expiresAt", "createdAt", "sessionId", "referenceId", "refreshId", "revoked", "confirmation") SELECT "id", "clientId", "userId", "token", COALESCE("scopes", '[]'), "authorizationCodeId", "resources", "requestedUserInfoClaims", "expiresAt", "createdAt", "sessionId", "referenceId", "refreshId", "revoked", "confirmation" FROM `oauthAccessToken`;--> statement-breakpoint
DROP TABLE `oauthAccessToken`;--> statement-breakpoint
ALTER TABLE `__new_oauthAccessToken` RENAME TO `oauthAccessToken`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);
--> statement-breakpoint
-- The rebuild above copies existing rows verbatim, so any already-persisted
-- empty-string scopes survive the table swap unchanged. Backfill them to a
-- valid empty JSON array rather than guessing at previously granted scopes —
-- unlike oauthClient's registration-time CIMD_TENANT_SCOPES default, a
-- token's scopes reflect what was actually granted and can't be reconstructed.
UPDATE `oauthAccessToken` SET `scopes` = '[]' WHERE `scopes` IS NULL OR `scopes` = '';