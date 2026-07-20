CREATE TABLE `oauthClientAssertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
-- Historical oauthClient.scopes defaults to an empty string, but Better Auth
-- reads it as a JSON string[] field. Repair existing URL-based CIMD clients
-- additively; rebuilding oauthClient would risk its referenced relationships.
UPDATE `oauthClient`
SET `scopes` = '["openid","offline_access","tenant"]'
WHERE (`scopes` IS NULL OR `scopes` = '')
  AND (`clientId` LIKE 'https://%' OR `clientId` LIKE 'http://localhost/%');
--> statement-breakpoint
-- ChatGPT metadata advertises private_key_jwt in the plural supported-methods
-- field. Older registrations lost that preference and its JWKS URI because the
-- CIMD library defaulted the absent singular field to `none`.
UPDATE `oauthClient`
SET `tokenEndpointAuthMethod` = 'private_key_jwt',
    `public` = 0,
    `jwksUri` = 'https://chatgpt.com/oauth/jwks.json'
WHERE `clientId` LIKE 'https://chatgpt.com/oauth/%/client.json';
