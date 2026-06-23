-- Migration number: 0010 	 2026-06-24T00:00:00.000Z
-- Better Auth's drizzleAdapter (server/utils/auth.ts) hands native JS `Date`
-- objects to every date field it manages (session.expiresAt, user.createdAt,
-- etc. are all `z.date()` in Better Auth's and the oauth-provider plugin's
-- own schemas). D1 can only bind primitives, so TEXT columns broke every
-- session insert. SQLite can't ALTER a column's type, so each affected
-- table is rebuilt with INTEGER (unix seconds, drizzle `mode: "timestamp"`)
-- columns in place of the old TEXT (ISO string) ones.

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
  banned, banReason, unixepoch(banExpires), unixepoch(createdAt), unixepoch(updatedAt)
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
  id, name, slug, logo, metadata, unixepoch(createdAt)
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
  unixepoch(expiresAt), unixepoch(accessTokenExpiresAt), unixepoch(refreshTokenExpiresAt),
  scope, password, unixepoch(createdAt), unixepoch(updatedAt)
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
  id, organizationId, email, role, status, unixepoch(expiresAt), inviterId, unixepoch(createdAt)
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
  id, publicKey, privateKey, alg, crv, unixepoch(createdAt), unixepoch(expiresAt)
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
  id, organizationId, userId, role, unixepoch(createdAt)
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
  id, unixepoch(expiresAt), token, unixepoch(createdAt), unixepoch(updatedAt),
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
  id, identifier, value, unixepoch(expiresAt), unixepoch(createdAt), unixepoch(updatedAt)
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
  userId, metadata, disabled, unixepoch(createdAt), unixepoch(updatedAt),
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
  id, clientId, userId, token, scopes, unixepoch(expiresAt), unixepoch(createdAt),
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
  id, clientId, userId, scopes, unixepoch(createdAt), unixepoch(updatedAt), referenceId
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
  id, clientId, userId, token, scopes, accessTokenId, unixepoch(expiresAt), unixepoch(createdAt),
  sessionId, referenceId, unixepoch(revoked), unixepoch(authTime)
FROM "oauthRefreshToken";

DROP TABLE "oauthRefreshToken";
ALTER TABLE "oauthRefreshToken_new" RENAME TO "oauthRefreshToken";

PRAGMA foreign_keys = ON;
