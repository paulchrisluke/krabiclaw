-- Migration number: 0010 	 2026-06-14T02:39:06.111Z
-- Add missing columns required by @better-auth/oauth-provider@1.6.18.
-- The original 0009 migration predated the full schema and is missing many
-- optional fields the library writes on client registration and token issuance.
-- Any non-undefined value in a missing column causes a D1 column-not-found 500.

-- oauthClient: missing optional fields
ALTER TABLE oauthClient ADD COLUMN enableEndSession INTEGER;
ALTER TABLE oauthClient ADD COLUMN subjectType TEXT;
ALTER TABLE oauthClient ADD COLUMN uri TEXT;
ALTER TABLE oauthClient ADD COLUMN icon TEXT;
ALTER TABLE oauthClient ADD COLUMN contacts TEXT;
ALTER TABLE oauthClient ADD COLUMN tos TEXT;
ALTER TABLE oauthClient ADD COLUMN policy TEXT;
ALTER TABLE oauthClient ADD COLUMN softwareId TEXT;
ALTER TABLE oauthClient ADD COLUMN softwareVersion TEXT;
ALTER TABLE oauthClient ADD COLUMN softwareStatement TEXT;
ALTER TABLE oauthClient ADD COLUMN postLogoutRedirectUris TEXT;
ALTER TABLE oauthClient ADD COLUMN tokenEndpointAuthMethod TEXT;
ALTER TABLE oauthClient ADD COLUMN grantTypes TEXT;
ALTER TABLE oauthClient ADD COLUMN responseTypes TEXT;
ALTER TABLE oauthClient ADD COLUMN type TEXT;
-- requirePKCE: existing requirePkce column satisfies this (SQLite is case-insensitive for column names)
ALTER TABLE oauthClient ADD COLUMN referenceId TEXT;

-- oauthRefreshToken: missing optional fields
ALTER TABLE oauthRefreshToken ADD COLUMN sessionId TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN referenceId TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN revoked TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN authTime TEXT;

-- oauthAccessToken: missing optional fields
ALTER TABLE oauthAccessToken ADD COLUMN sessionId TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN referenceId TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN refreshId TEXT;

-- oauthConsent: missing optional field
ALTER TABLE oauthConsent ADD COLUMN referenceId TEXT;
