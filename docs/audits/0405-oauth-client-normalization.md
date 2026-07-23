# OAuth Client Normalization Audit

Issue: #405
Date: 2026-07-23
Installed Better Auth packages: `better-auth`, `@better-auth/oauth-provider`, and `@better-auth/cimd` at `1.7.0-beta.10`.

Reference: Better Auth's beta CIMD docs require the singular `token_endpoint_auth_method` field for client authentication method selection: https://better-auth.com/docs/beta/plugins/cimd

## Inventory

### Removed: `oauthClient` database hook scope defaulting

`server/utils/auth.ts` no longer installs `databaseHooks.oauthClient.create.before` or `databaseHooks.oauthClient.update.before` to coerce missing `scopes` values.

This workaround was originally needed when Better Auth's logical `oauthClient.scopes` field mapped to the historical `oauthClient.scopes` SQLite column, whose default is an invalid empty JSON string. Current auth config maps the logical field to `oauthClient.scopesJson`, and `server/db/schema.ts` declares that canonical column as `text().default("[]").notNull()`. Better Auth can now create/read clients without the hook because the schema-level default is already valid JSON-array storage.

Route validation: `tests/e2e/oauth-discovery.spec.ts` exercises the real authorize, consent, token, discovery, and protected-resource routes after the hook removal.

### Keep: ChatGPT-shaped CIMD private client normalization

`normalizeCimdClientAuthentication` remains wired through `cimd({ onClientCreated, onClientRefreshed })`.

Reason: `@better-auth/cimd@1.7.0-beta.10` filters metadata through `toOAuthClientBody`, which accepts the singular `token_endpoint_auth_method` field and defaults it to `none`. ChatGPT-shaped metadata can instead advertise `private_key_jwt` only in `token_endpoint_auth_methods_supported` with a `jwks_uri`. Without the hook, the client is registered as public and token exchange rejects ChatGPT's signed client assertion.

Regression gate: `tests/e2e/oauth-discovery.spec.ts` uses `server/api/auth/oauth2/test-private-client-metadata.get.ts`, which deliberately omits the singular field and includes `token_endpoint_auth_methods_supported: ["none", "private_key_jwt"]`. The test proves the real route can issue tokens with a signed assertion and rejects assertion replay.

Removal condition: remove this hook after the installed `@better-auth/cimd` maps plural advertised methods to a singular stored `tokenEndpointAuthMethod`, or after ChatGPT metadata reliably includes the singular field.

### Keep: CIMD tenant scope default inside `normalizeCimdClientAuthentication`

The hook still fills `openid offline_access tenant` when Better Auth returns a client with no scopes.

Reason: the provider supports both tenant and platform MCP scopes, but URL CIMD clients are tenant connectors unless explicitly registered otherwise. The retained hook prevents an empty-scope CIMD row from later failing tenant authorization. This branch is narrower than the removed database hook because it only runs for CIMD-created/refreshed clients and only when Better Auth returns no scopes.

Removal condition: remove this branch if Better Auth/CIMD gains a first-class per-discovery default scope option, or if KrabiClaw adds an explicit platform-CIMD registration path that can distinguish tenant and platform clients at registration time.

### Deferred: historical `oauthClient.scopes` column

The old `oauthClient.scopes` column remains because it is part of an already-applied Better Auth-owned table with child references. `scopesJson` remains the mapped canonical field for Better Auth's logical scopes value. Removing or rebuilding the historical column is deferred unless a future migration can preserve all references and pass the D1 migration safety rules.
