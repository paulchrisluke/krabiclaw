import { HTTPError } from 'nitro';
import type { H3Event } from 'nitro';
import { } from 'nitro/h3';
import { verifyJwsAccessToken } from 'better-auth/oauth2'
import type { JSONWebKeySet, JWTPayload } from 'jose'
import { createAuth, getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { queryFirst } from '~/server/db'
import { assertSiteWideAccess, isOrganizationWideRole, resolveOrganizationMembership } from '~/server/utils/member-access'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import { cloudflareEnv } from '~/server/utils/api-response'

export type McpToolRole = 'owner' | 'admin' | 'editor'

const ROLE_RANK: Record<McpToolRole, number> = {
  editor: 1,
  admin: 2,
  owner: 3,
}

const MCP_AUTH_JWKS_CACHE_KEY = {}

export interface McpUserContext {
  env: CloudflareEnv
  db: D1Database
  userId: string
  isPlatformAdmin: boolean
  scopes: string[]
  oauthClientId?: string | null
  // Only populated for session-based auth (ChowBot/dashboard) — bearer-token
  // auth (e.g. ChatGPT connector) has no browser session to read this from.
  activeOrganizationId?: string
}

export interface McpSiteContext extends McpUserContext {
  siteId: string
  organizationId: string
  memberId: string
  organizationSlug?: string
  subdomain?: string | null
  customDomain?: string | null
  publicUrl?: string | null
  role: McpToolRole
  sessionId?: string | null
}

interface McpAuthChallengeDetails {
  error: 'invalid_token' | 'insufficient_scope'
  description: string
  scope?: string
}

export interface RequireMcpUserOptions {
  audiences?: string[]
  requiredScopes?: string[]
  requirePlatformAdmin?: boolean
  forbiddenScopes?: string[]
  allowSession?: boolean
}

export async function requireMcpUser(
  event: H3Event,
  options: RequireMcpUserOptions = {},
): Promise<McpUserContext> {
  // No implicit cross-surface forbidding: a token can legitimately present more
  // scopes than the current MCP surface needs. The real per-surface boundary is
  // `audiences` (aud claim, bound to the resource param) plus requirePlatformAdmin
  // or the DB site-membership check each route already performs.
  const normalizedOptions: RequireMcpUserOptions = {
    ...options,
    forbiddenScopes: options.forbiddenScopes ?? [],
  }
  const env = cloudflareEnv(event)
  const db = env?.DB
  if (!env || !db) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  const authHeader = (event.req.headers.get('authorization'))
  if (authHeader?.startsWith('Bearer ')) {
    const user = await verifyBearerToken(event, authHeader.slice(7), env, db, normalizedOptions)
    if (normalizedOptions.requirePlatformAdmin && !user.isPlatformAdmin) {
      throw new HTTPError({ statusCode: 403, statusMessage: 'Platform admin access required' })
    }
    return user
  }

  if (normalizedOptions.allowSession === false) {
    throw new HTTPError({ statusCode: 401, statusMessage: 'Bearer authentication required' })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  // Session-based auth has no token to derive scopes from, so we assume the caller's
  // requested scopes are granted outright. This is safe because forbiddenScopes and
  // requirePlatformAdmin below still enforce the real restrictions for this surface.
  const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
  const user = {
    env,
    db,
    userId: session.user.id,
    isPlatformAdmin: await hasPlatformEventPermission(event, env, { platform: ['access'] }),
    scopes: normalizedOptions.requiredScopes ?? ['tenant'],
    activeOrganizationId: typeof sessionRecord.activeOrganizationId === 'string' ? sessionRecord.activeOrganizationId : undefined,
  }
  ensureForbiddenScopesAbsent(user.scopes, normalizedOptions.forbiddenScopes)
  if (normalizedOptions.requirePlatformAdmin && !user.isPlatformAdmin) {
    throw new HTTPError({ statusCode: 403, statusMessage: 'Platform admin access required' })
  }
  return user
}

async function verifyBearerToken(
  event: H3Event,
  token: string,
  env: CloudflareEnv,
  db: D1Database,
  options: RequireMcpUserOptions,
): Promise<McpUserContext> {
  const baseUrl = env.BETTER_AUTH_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new HTTPError({ statusCode: 500, statusMessage: 'BETTER_AUTH_URL is required' })
  const tokenFingerprint = (await sha256Base64Url(token)).slice(0, 12)

  const audiences = options.audiences?.length
    ? options.audiences
    : [`${baseUrl}/api/mcp`]
  // Use ?? (not ?.length ? :) so a surface can explicitly opt out of any scope
  // requirement by passing requiredScopes: [] — see platform.post.ts, where the
  // real authorization boundary is requirePlatformAdmin (DB role), not the OAuth
  // scope claim alone.
  const requiredScopes = options.requiredScopes ?? ['tenant']

  let payload: JWTPayload & { client_id?: unknown }
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => getAuthJwks(event, env),
      jwksCacheKey: MCP_AUTH_JWKS_CACHE_KEY,
      verifyOptions: {
        audience: audiences,
        issuer: baseUrl,
      },
    })
    if (hasDpopBinding(payload)) {
      throw new Error('DPoP-bound access token requires request verification')
    }
  } catch (error) {
    const authChallenge = mcpAuthChallengeFromVerifyError(error, requiredScopes)
    // claimed_* fields are decoded WITHOUT signature verification — never use
    // them for auth decisions, only to see what a rejected token *claims*
    // (aud/exp/iss mismatches are otherwise invisible: the verifier only
    // reports a reason code, not the values that produced it).
    logMcpAuth(event, 'warn', 'credential_rejected', {
      path: event.path,
      token_fingerprint: tokenFingerprint,
      token_shape: token.split('.').length === 3 ? 'jwt' : 'opaque',
      reason: error instanceof Error ? error.message : String(error),
      oauth_error: authChallenge.error,
      audiences_checked: audiences,
      required_scopes: requiredScopes,
      now_iso: new Date().toISOString(),
      ...(await decodeJwtClaimsUnsafe(token)),
    })
    // Always 401, matching the pre-existing behavior for both invalid_token
    // and insufficient_scope: asMcpError maps statusCode 403 to kind
    // 'forbidden', a different code path used for tool-role permission
    // denials (respondToMcpError returns a plain tool-error result there,
    // dropping the WWW-Authenticate challenge). RFC 6750 §3.1 permits 401
    // for insufficient_scope too ("MAY" 403, not "SHOULD"), so this stays
    // spec-compliant while keeping the challenge intact on every path.
    throw new HTTPError({
      statusCode: 401,
      statusMessage: authChallenge.description,
      data: { mcpAuth: authChallenge },
    })
  }

  const scopes = parseScopesFromJwtPayload(payload.scope)
  const missingScopes = requiredScopes.filter(requiredScope => !scopes.includes(requiredScope))
  if (missingScopes.length > 0) {
    const requiredScopeValue = requiredScopes.join(' ')
    logMcpAuth(event, 'warn', 'credential_rejected', {
      path: event.path,
      token_fingerprint: tokenFingerprint,
      reason: 'scope_missing',
      missing_scopes: missingScopes,
      audiences_checked: audiences,
      required_scopes: requiredScopes,
    })
    throw new HTTPError({
      statusCode: 401,
      statusMessage: `${requiredScopeValue} scopes required`,
      data: { mcpAuth: { error: 'insufficient_scope', description: `${requiredScopeValue} scopes required`, scope: requiredScopeValue } },
    })
  }
  ensureForbiddenScopesAbsent(scopes, options.forbiddenScopes)

  const userId = typeof payload.sub === 'string' ? payload.sub : null
  if (!userId) {
    logMcpAuth(event, 'warn', 'credential_rejected', {
      path: event.path,
      token_fingerprint: tokenFingerprint,
      reason: 'subject_missing',
    })
    throw new HTTPError({
      statusCode: 401,
      statusMessage: 'Token missing, expired, invalid, or not issued for this MCP resource',
      data: { mcpAuth: { error: 'invalid_token', description: 'Token missing, expired, invalid, or not issued for this MCP resource' } },
    })
  }
  const oauthClientId = typeof payload.client_id === 'string' ? payload.client_id : null

  const isPlatformAdmin = await hasPlatformEventPermission(event, env, { platform: ['access'] })

  logMcpAuth(event, 'info', 'credential_accepted', {
    path: event.path,
    token_fingerprint: tokenFingerprint,
    audiences_checked: audiences,
  })

  return {
    env,
    db,
    userId,
    oauthClientId,
    isPlatformAdmin,
    scopes,
  }
}

async function getAuthJwks(event: H3Event, env: CloudflareEnv): Promise<JSONWebKeySet | undefined> {
  const baseUrl = env.BETTER_AUTH_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new HTTPError({ statusCode: 500, statusMessage: 'BETTER_AUTH_URL is required' })
  const response = await createAuth(env).handler(new Request(`${baseUrl}/api/auth/jwks`, {
    method: 'GET',
    headers: Object.fromEntries(event.req.headers.entries()) as HeadersInit,
  }))
  if (!response.ok) return undefined
  return await response.json() as JSONWebKeySet
}

function hasDpopBinding(payload: JWTPayload): boolean {
  const cnf = payload.cnf
  return !!cnf && typeof cnf === 'object' && 'jkt' in cnf
}

// Better Auth's verifyBearerToken throws a better-call APIError: status
// FORBIDDEN with message `invalid scope ${scope}` for a missing required
// scope, status UNAUTHORIZED for anything else (expired/invalid signature/
// wrong audience/wrong issuer/not a JWT at all). Duck-typed rather than
// checked with `instanceof`/`isAPIError` — a differently-bundled copy of
// better-call across packages can fail an instanceof check even though the
// thrown value carries the real .status/.statusCode/.message shape (verified
// empirically against the installed better-auth/@better-auth/oauth-provider
// version pair).
function isBetterAuthApiError(error: unknown): error is { status: string; message: string } {
  return !!error && typeof error === 'object' && 'status' in error && 'statusCode' in error && typeof (error as { message?: unknown }).message === 'string'
}

function mcpAuthChallengeFromVerifyError(error: unknown, requiredScopes: string[]): McpAuthChallengeDetails {
  if (isBetterAuthApiError(error) && error.status === 'FORBIDDEN') {
    // @better-auth/core's verifyAccessTokenPayload only ever throws FORBIDDEN
    // for a missing required scope — the status alone is the reliable
    // classification signal. The `invalid scope ${sc}` message text is only
    // used as a best-effort way to name which scope for the challenge/log;
    // an upstream wording change degrades that naming, not the
    // insufficient_scope classification itself.
    const missingScope = requiredScopes.find(scope => error.message.includes(scope)) ?? requiredScopes[0]
    return {
      error: 'insufficient_scope',
      description: missingScope ? `${missingScope} scope required` : 'Required scope missing',
      scope: missingScope,
    }
  }
  return {
    error: 'invalid_token',
    description: 'Token missing, expired, invalid, or not issued for this MCP resource',
  }
}

// Decodes a JWT's payload segment without verifying the signature — used only
// for diagnostic logging on a REJECTED token, so we can see what it claims
// (aud/exp/iss/sub) instead of just a reason code. Never use this output for
// an auth decision. Silently returns {} for opaque tokens or malformed JWTs.
// claimed_sub is hashed+truncated the same way token_fingerprint is — it's a
// stable per-user identifier decoded from an unverified token, so it's logged
// as a correlatable fingerprint rather than the raw id. aud/iss/scope aren't
// user-identifying (they're the resource URL and permission strings), so
// those are logged as-is for debugging value.
async function decodeJwtClaimsUnsafe(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.')
  if (parts.length !== 3) return {}
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
    return {
      claimed_aud: Array.isArray(payload.aud) ? payload.aud.slice(0, 5).join(', ').substring(0, 100) : (typeof payload.aud === 'string' ? payload.aud.substring(0, 100) : null),
      claimed_iss: typeof payload.iss === 'string' ? payload.iss.substring(0, 100) : null,
      claimed_sub_fingerprint: typeof payload.sub === 'string' ? (await sha256Base64Url(payload.sub)).slice(0, 12) : null,
      claimed_scope: typeof payload.scope === 'string' ? payload.scope.substring(0, 200) : null,
      claimed_exp_iso: typeof payload.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : null,
      claimed_iat_iso: typeof payload.iat === 'number' ? new Date(payload.iat * 1000).toISOString() : null,
    }
  } catch {
    return { claimed_decode_error: true }
  }
}

function logMcpAuth(
  event: H3Event,
  level: 'info' | 'warn',
  authEvent: string,
  fields: Record<string, unknown>,
) {
  console[level]('[MCP_AUTH]', JSON.stringify({
    event: authEvent,
    ray_id: (event.req.headers.get('cf-ray')) ?? null,
    user_agent: (event.req.headers.get('user-agent')) ?? null,
    ...fields,
  }))
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('base64url')
}

function parseScopesFromJwtPayload(scopeClaim: unknown) {
  if (typeof scopeClaim !== 'string') return []
  return scopeClaim.split(' ').filter(Boolean)
}

function ensureForbiddenScopesAbsent(scopes: string[], forbiddenScopes?: string[]) {
  const blocked = (forbiddenScopes ?? []).find(scope => scopes.includes(scope))
  if (blocked) {
    throw new HTTPError({ statusCode: 403, statusMessage: `Token scope ${blocked} is not allowed for this MCP surface` })
  }
}

// siteId accepts the site's id, subdomain, or custom_domain — all three are exact,
// unambiguous identifiers (unlike a free-text business name), so resolving them
// directly here removes a list-then-match round trip for every site-scoped tool.
export async function requireMcpSite(
  event: H3Event,
  siteId: string,
  minimumRole: McpToolRole = 'editor',
  authenticatedUser?: McpUserContext,
): Promise<McpSiteContext> {
  const user = authenticatedUser ?? await requireMcpUser(event)

  type SiteRow = { id: string; organization_id: string; subdomain: string | null; custom_domain: string | null; public_url: string | null }
  const siteByColumn = async (column: 'id' | 'subdomain' | 'custom_domain') =>
    queryFirst<SiteRow>(
      user.db,
      `
      SELECT s.id, s.organization_id, s.subdomain, s.custom_domain, s.public_url
      FROM sites s
      WHERE s.${column} = ?
      LIMIT 1
    `,
      [siteId],
    )

  // Check id first, then subdomain, then custom_domain — see note above on
  // why an OR across all three columns is ambiguous.
  const site = await siteByColumn('id')
    ?? await siteByColumn('subdomain')
    ?? await siteByColumn('custom_domain')

  if (!site?.organization_id) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  }
  const membership = await resolveOrganizationMembership(user.env, {
    organizationId: site.organization_id,
    userId: user.userId,
  })
  if (!membership) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found or access denied' })

  const role = normalizeRole(membership.role)
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw new HTTPError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  // MCP tools operate on a whole site at this auth layer, so an editor needs
  // the site's resource team membership to use any MCP tool at all. A
  // location-only editor is rejected here rather than silently getting
  // whole-site access. This is strictly a tightening versus the prior
  // role-name-only check: it was already impossible for a location-scoped
  // role to satisfy `minimumRole: 'editor'` before this change (that role
  // name didn't normalize to a valid McpToolRole), so no existing MCP user
  // loses access — only the never-actually-reachable case is now enforced
  // explicitly instead of accidentally.
  if (!isOrganizationWideRole(role)) {
    await assertSiteWideAccess(user.db, {
      env: user.env,
      memberId: membership.memberId,
      role,
      organizationId: site.organization_id,
      siteId: site.id,
    })
  }

  return {
    ...user,
    siteId: site.id,
    organizationId: site.organization_id,
    memberId: membership.memberId,
    organizationSlug: membership.organizationSlug || undefined,
    subdomain: site.subdomain ?? null,
    customDomain: site.custom_domain ?? null,
    publicUrl: site.public_url ?? null,
    role,
  }
}

export async function getVisibleSiteContext(
  event: H3Event,
  siteId: string,
): Promise<{ role: McpToolRole; organizationId: string; siteId: string } | null> {
  try {
    const site = await requireMcpSite(event, siteId, 'editor')
    return { role: site.role, organizationId: site.organizationId, siteId: site.siteId }
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
      ? Number((error as { statusCode: number }).statusCode)
      : typeof (error as { status?: unknown })?.status === 'number'
        ? Number((error as { status: number }).status)
        : null
    if (statusCode === 403 || statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function getActiveEntitlements(db: D1Database, organizationId: string, keys: string[], _siteId?: string): Promise<Set<string>> {
  if (!keys.length) return new Set()
  const projection = await getOrganizationBillingProjection(db, organizationId)
  if (
    !projection
    || typeof projection !== 'object'
    || !projection.entitlements
    || typeof projection.entitlements !== 'object'
    || Array.isArray(projection.entitlements)
  ) {
    throw new Error('Invalid organization billing projection entitlements.')
  }
  return new Set(keys.filter(key => projection.entitlements[key] === true))
}

export function roleSatisfies(actual: McpToolRole, minimum: McpToolRole) {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

export function normalizeRole(role: string | null | undefined): McpToolRole | null {
  if (role === 'owner' || role === 'admin' || role === 'editor') return role
  return null
}

export function requestOrigin(headers: HeadersInit | undefined) {
  const normalized = new Headers(headers)
  return normalized.get('origin')
}

export function requestHeaders(event: H3Event) {
  return Object.fromEntries(event.req.headers.entries()) as HeadersInit
}
