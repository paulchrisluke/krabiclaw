ALTER TABLE `oauthClient` ADD `clientCredentialsScopes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `clientDiscoveryId` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `applicationType` text;