CREATE TABLE `oauthClientResource` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`resourceId` text NOT NULL,
	`metadata` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resourceId`) REFERENCES `oauthResource`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauthResource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`accessTokenTtl` integer,
	`refreshTokenTtl` integer,
	`signingAlgorithm` text,
	`signingKeyId` text,
	`allowedScopes` text,
	`customClaims` text,
	`dpopBoundAccessTokensRequired` integer DEFAULT 0 NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`policyVersion` integer DEFAULT 1 NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResource_identifier_unique` ON `oauthResource` (`identifier`);--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `authorizationCodeId` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `requestedUserInfoClaims` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `revoked` integer;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `confirmation` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `backchannelLogoutUri` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `backchannelLogoutSessionRequired` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `jwks` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `jwksUri` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `dpopBoundAccessTokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `oauthConsent` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthConsent` ADD `requestedUserInfoClaims` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `authorizationCodeId` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `requestedUserInfoClaims` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotatedAt` integer;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotationReplayResponse` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotationReplayExpiresAt` integer;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `confirmation` text;