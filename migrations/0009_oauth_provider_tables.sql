-- OAuth 2.1 provider tables required by @better-auth/oauth-provider and jwt() plugin.
-- Column names follow Better Auth camelCase convention for auth tables.

CREATE TABLE IF NOT EXISTS jwks (
  id TEXT PRIMARY KEY,
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL,
  alg TEXT,
  crv TEXT,
  createdAt TEXT NOT NULL,
  expiresAt TEXT
);

CREATE TABLE IF NOT EXISTS oauthClient (
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
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauthAccessToken (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT,
  token TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '',
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauthRefreshToken (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT,
  token TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT '',
  accessTokenId TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauthConsent (
  id TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(clientId, userId)
);
