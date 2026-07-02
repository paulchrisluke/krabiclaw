-- Migration number: 0021 	 2026-07-02T00:00:00.000Z
-- Better Auth's drizzleAdapter (server/utils/auth.ts) hands native JS `Date`
-- objects to every date field it manages (session.expiresAt, user.createdAt,
-- etc. are all `z.date()` in Better Auth's and the oauth-provider plugin's
-- own schemas). server/db/schema.ts declares these as `integer({ mode:
-- "timestamp" })`, but production's actual columns are still the original
-- TEXT (ISO string) columns — the equivalent conversion migration
-- (originally 0010_convert-better-auth-timestamps-to-integer.sql) was
-- deleted by commit 7a9ca01b the day after it was written and never
-- reapplied. This broke MCP OAuth token verification in prod:
-- server/utils/mcp-auth.ts reads oauthAccessToken.expiresAt expecting unix
-- seconds and does `expiresAt * 1000`, which is NaN against an ISO string,
-- so every opaque-token check fails as 'expiry_invalid' — the oauth-provider
-- plugin's own refresh-token exchange does equivalent Date arithmetic
-- against oauthRefreshToken.expiresAt with the same corruption, minting
-- access tokens with a NaN/invalid `exp` claim.
--
-- SQLite can't ALTER a column's type, so each affected table is rebuilt
-- with INTEGER (unix seconds, drizzle `mode: "timestamp"`) columns in
-- place of the old TEXT (ISO string) ones. Column lists below were
-- verified against live prod (`PRAGMA table_info`) on 2026-07-02 to match
-- migrations 0001-0020 exactly, so no columns added since 0010 was
-- originally written are dropped by this rebuild.
--
-- Prod/staging/preview data was a MIX of two TEXT formats, not just ISO
-- strings: some rows (written by an earlier partial workaround) already
-- held epoch seconds as text, e.g. '1782822193.0', which unixepoch()
-- cannot parse as a datetime and returns NULL for. Local dev never had
-- this bug at all — its tables were built from 0001_initial.sql's INTEGER
-- declaration from the start, so its data is already correctly typed.
-- Every conversion below is therefore
-- `CASE WHEN typeof(x) = 'integer' THEN x ELSE COALESCE(unixepoch(x), CASE WHEN x GLOB '[0-9]*' THEN CAST(x AS INTEGER) ELSE NULL END) END`
-- so this migration is idempotent: already-integer columns pass through
-- untouched (no Julian-day misinterpretation from feeding a bare integer
-- to unixepoch()), already-numeric text falls back to a plain cast, and
-- ISO text still converts normally. The GLOB '[0-9]*' guard is
-- deliberate: bare CAST(x AS INTEGER) on non-numeric text silently
-- returns 0 in SQLite, which would write a garbage 1970 timestamp
-- instead of failing. Restricting CAST to digit-leading text means any
-- truly blank/garbage value falls through to NULL, which then aborts
-- the whole migration via the destination column's NOT NULL constraint
-- (verified: no such values exist in prod/staging/preview as of
-- 2026-07-02, but this keeps future/other environments failing loudly
-- instead of writing wrong data).

PRAGMA foreign_keys = OFF;

-- user
CREATE TABLE "user_new" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  phoneNumber TEXT UNIQUE,
  phoneNumberVerified INTEGER NOT NULL DEFAULT 0,
  role TEXT DEFAULT 'user',
  banned INTEGER DEFAULT 0,
  banReason TEXT,
  banExpires INTEGER,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO "user_new" SELECT
  id, name, email, emailVerified, image, phoneNumber, phoneNumberVerified, role,
  banned, banReason, CASE WHEN typeof(banExpires) = 'integer' THEN banExpires ELSE COALESCE(unixepoch(banExpires), CASE WHEN banExpires GLOB '[0-9]*' THEN CAST(banExpires AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END
FROM "user";

DROP TABLE "user";
ALTER TABLE "user_new" RENAME TO "user";

-- organization
CREATE TABLE "organization_new" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  metadata TEXT,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO "organization_new" SELECT
  id, name, slug, logo, metadata, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END
FROM "organization";

DROP TABLE "organization";
ALTER TABLE "organization_new" RENAME TO "organization";

-- account
CREATE TABLE "account_new" (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  expiresAt INTEGER,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO "account_new" SELECT
  id, accountId, providerId, userId, accessToken, refreshToken, idToken,
  CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(accessTokenExpiresAt) = 'integer' THEN accessTokenExpiresAt ELSE COALESCE(unixepoch(accessTokenExpiresAt), CASE WHEN accessTokenExpiresAt GLOB '[0-9]*' THEN CAST(accessTokenExpiresAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(refreshTokenExpiresAt) = 'integer' THEN refreshTokenExpiresAt ELSE COALESCE(unixepoch(refreshTokenExpiresAt), CASE WHEN refreshTokenExpiresAt GLOB '[0-9]*' THEN CAST(refreshTokenExpiresAt AS INTEGER) ELSE NULL END) END,
  scope, password, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END
FROM "account";

DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";

-- invitation
CREATE TABLE "invitation_new" (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expiresAt INTEGER NOT NULL,
  inviterId TEXT NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (inviterId) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO "invitation_new" SELECT
  id, organizationId, email, role, status, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, inviterId, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END
FROM "invitation";

DROP TABLE "invitation";
ALTER TABLE "invitation_new" RENAME TO "invitation";

-- jwks
CREATE TABLE "jwks_new" (
  id TEXT PRIMARY KEY,
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL,
  alg TEXT,
  crv TEXT,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER
);

INSERT INTO "jwks_new" SELECT
  id, publicKey, privateKey, alg, crv, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END
FROM "jwks";

DROP TABLE "jwks";
ALTER TABLE "jwks_new" RENAME TO "jwks";

-- member
CREATE TABLE "member_new" (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (organizationId) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO "member_new" SELECT
  id, organizationId, userId, role, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END
FROM "member";

DROP TABLE "member";
ALTER TABLE "member_new" RENAME TO "member";

-- session
CREATE TABLE "session_new" (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  ipAddress TEXT,
  userAgent TEXT,
  activeOrganizationId TEXT,
  activeTeamId TEXT,
  impersonatedBy TEXT,
  userId TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO "session_new" SELECT
  id, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, token, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END,
  ipAddress, userAgent, activeOrganizationId, activeTeamId, impersonatedBy, userId
FROM "session";

DROP TABLE "session";
ALTER TABLE "session_new" RENAME TO "session";

-- verification
CREATE TABLE "verification_new" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO "verification_new" SELECT
  id, identifier, value, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END
FROM "verification";

DROP TABLE "verification";
ALTER TABLE "verification_new" RENAME TO "verification";

-- oauthClient
CREATE TABLE "oauthClient_new" (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL UNIQUE,
  clientSecret TEXT,
  name TEXT NOT NULL,
  redirectUris TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  public INTEGER NOT NULL DEFAULT 0,
  requirePkce INTEGER NOT NULL DEFAULT 1,
  skipConsent INTEGER NOT NULL DEFAULT 0,
  userId TEXT,
  metadata TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  enableEndSession INTEGER,
  subjectType TEXT,
  uri TEXT,
  icon TEXT,
  contacts TEXT,
  tos TEXT,
  policy TEXT,
  softwareId TEXT,
  softwareVersion TEXT,
  softwareStatement TEXT,
  postLogoutRedirectUris TEXT,
  tokenEndpointAuthMethod TEXT,
  grantTypes TEXT,
  responseTypes TEXT,
  type TEXT,
  referenceId TEXT
);

INSERT INTO "oauthClient_new" SELECT
  id, clientId, clientSecret, name, redirectUris, scopes, public, requirePkce, skipConsent,
  userId, metadata, disabled, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END,
  enableEndSession, subjectType, uri, icon, contacts, tos, policy, softwareId,
  softwareVersion, softwareStatement, postLogoutRedirectUris, tokenEndpointAuthMethod,
  grantTypes, responseTypes, type, referenceId
FROM "oauthClient";

DROP TABLE "oauthClient";
ALTER TABLE "oauthClient_new" RENAME TO "oauthClient";

-- oauthAccessToken
CREATE TABLE "oauthAccessToken_new" (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT,
  token TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '',
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  sessionId TEXT,
  referenceId TEXT,
  refreshId TEXT
);

INSERT INTO "oauthAccessToken_new" SELECT
  id, clientId, userId, token, scopes, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END,
  sessionId, referenceId, refreshId
FROM "oauthAccessToken";

DROP TABLE "oauthAccessToken";
ALTER TABLE "oauthAccessToken_new" RENAME TO "oauthAccessToken";

-- oauthConsent
CREATE TABLE "oauthConsent_new" (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  referenceId TEXT,
  UNIQUE(clientId, userId)
);

INSERT INTO "oauthConsent_new" SELECT
  id, clientId, userId, scopes, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(updatedAt) = 'integer' THEN updatedAt ELSE COALESCE(unixepoch(updatedAt), CASE WHEN updatedAt GLOB '[0-9]*' THEN CAST(updatedAt AS INTEGER) ELSE NULL END) END, referenceId
FROM "oauthConsent";

DROP TABLE "oauthConsent";
ALTER TABLE "oauthConsent_new" RENAME TO "oauthConsent";

-- oauthRefreshToken
CREATE TABLE "oauthRefreshToken_new" (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT,
  token TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '',
  accessTokenId TEXT,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  sessionId TEXT,
  referenceId TEXT,
  revoked INTEGER,
  authTime INTEGER
);

INSERT INTO "oauthRefreshToken_new" SELECT
  id, clientId, userId, token, scopes, accessTokenId, CASE WHEN typeof(expiresAt) = 'integer' THEN expiresAt ELSE COALESCE(unixepoch(expiresAt), CASE WHEN expiresAt GLOB '[0-9]*' THEN CAST(expiresAt AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(createdAt) = 'integer' THEN createdAt ELSE COALESCE(unixepoch(createdAt), CASE WHEN createdAt GLOB '[0-9]*' THEN CAST(createdAt AS INTEGER) ELSE NULL END) END,
  sessionId, referenceId, CASE WHEN typeof(revoked) = 'integer' THEN revoked ELSE COALESCE(unixepoch(revoked), CASE WHEN revoked GLOB '[0-9]*' THEN CAST(revoked AS INTEGER) ELSE NULL END) END, CASE WHEN typeof(authTime) = 'integer' THEN authTime ELSE COALESCE(unixepoch(authTime), CASE WHEN authTime GLOB '[0-9]*' THEN CAST(authTime AS INTEGER) ELSE NULL END) END
FROM "oauthRefreshToken";

DROP TABLE "oauthRefreshToken";
ALTER TABLE "oauthRefreshToken_new" RENAME TO "oauthRefreshToken";

PRAGMA foreign_keys = ON;
