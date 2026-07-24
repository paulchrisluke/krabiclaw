import { createError, getHeader, getHeaders, type H3Event } from 'h3'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'
import { queryAll, queryFirst } from '~/server/db'
import { assertSiteWideAccess, isOrganizationWideRole } from '~/server/utils/member-access'

export type McpToolRole = 'owner' | 'admin' | 'editor'

const ROLE_RANK: Record<McpToolRole, number> = {
  editor: 1,
  admin: 2,
  owner: 3,
}

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
  organizationSlug?: string
  subdomain?: string | null
  customDomain?: string | null
  publicUrl?: string | null
  role: McpToolRole
}

interface TokenLookupResult {
  userId: string | null
  reason: string
  oauthClientId?: string | null
}

interface VerifiedTokenIdentity {
  userId: string
  tokenKind: 'jwt' | 'opaque'
  oauthClientId?: string | null
}

interface TokenVerificationResult {
  identity: VerifiedTokenIdentity | null
  jwtReason: string
  opaqueReason: string
  scopes: string[]
}

interface McpAuthChallengeDetails {
  error: 'invalid_token' | 'insufficient_scope'
  description: string
  scope?: string
}

interface RequireMcpUserOptions {
  audiences?: string[]
  requiredScopes?: string[]
  requirePlatformAdmin?: boolean
  forbiddenScopes?: string[]
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
  const env = event.context.cloudflare?.env as CloudflareEnv | undefined
  const db = env?.DB
  if (!env || !db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const user = await verifyBearerToken(event, authHeader.slice(7), env, db, normalizedOptions)
    if (normalizedOptions.requirePlatformAdmin && !user.isPlatformAdmin) {
      throw createError({ statusCode: 403, statusMessage: 'Platform admin access required' })
    }
    return user
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
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
    throw createError({ statusCode: 403, statusMessage: 'Platform admin access required' })
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
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')
  const tokenFingerprint = (await sha256Base64Url(token)).slice(0, 12)

  const audiences = options.audiences?.length
    ? options.audiences
    : [`${baseUrl}/api/mcp`]
  // Use ?? (not ?.length ? :) so a surface can explicitly opt out of any scope
  // requirement by passing requiredScopes: [] — see platform.post.ts, where the
  // real authorization boundary is requirePlatformAdmin (DB role), not the OAuth
  // scope claim alone.
  const requiredScopes = options.requiredScopes ?? ['tenant']

  const verification = await verifyJwtOrOpaqueToken(token, baseUrl, db, audiences, requiredScopes)
  if (!verification.identity) {
    const authChallenge = mcpAuthChallengeDetails(verification, requiredScopes)
    // claimed_* fields are decoded WITHOUT signature verification — never use
    // them for auth decisions, only to see what a rejected token *claims*
    // (aud/exp/iss mismatches are otherwise invisible: the verifier only
    // reports a reason code, not the values that produced it).
    logMcpAuth(event, 'warn', 'credential_rejected', {
      path: event.path,
      token_fingerprint: tokenFingerprint,
      token_shape: token.split('.').length === 3 ? 'jwt' : 'opaque',
      jwt_reason: verification.jwtReason,
      opaque_reason: verification.opaqueReason,
      oauth_error: authChallenge.error,
      audiences_checked: audiences,
      required_scopes: requiredScopes,
      now_iso: new Date().toISOString(),
      ...(await decodeJwtClaimsUnsafe(token)),
    })
    throw createError({
      statusCode: 401,
      statusMessage: authChallenge.description,
      data: { mcpAuth: authChallenge },
    })
  }
  const identity = verification.identity
  ensureForbiddenScopesAbsent(verification.scopes, options.forbiddenScopes)

  const user = await queryFirst<{ role?: string; email?: string | null }>(
    db,
    'SELECT role, email FROM user WHERE id = ? LIMIT 1',
    [identity.userId],
  )

  if (!user) {
    logMcpAuth(event, 'warn', 'credential_rejected', {
      path: event.path,
      token_fingerprint: tokenFingerprint,
      token_kind: identity.tokenKind,
      reason: 'user_not_found',
    })
    throw createError({ statusCode: 401, statusMessage: 'User not found' })
  }

  logMcpAuth(event, 'info', 'credential_accepted', {
    path: event.path,
    token_fingerprint: tokenFingerprint,
    token_kind: identity.tokenKind,
    audiences_checked: audiences,
  })

  return {
    env,
    db,
    userId: identity.userId,
    oauthClientId: identity.oauthClientId ?? null,
    isPlatformAdmin: hasPlatformAdminPermission(user.role),
    scopes: verification.scopes,
  }
}

function mcpAuthChallengeDetails(
  verification: TokenVerificationResult,
  requiredScopes: string[],
): McpAuthChallengeDetails {
  const missingScope = requiredScopes.find(scope =>
    verification.jwtReason === `${scope}_scope_missing` ||
    verification.opaqueReason === `${scope}_scope_missing`
  )
  if (missingScope) {
    return {
      error: 'insufficient_scope',
      description: `${missingScope} scope required`,
      scope: missingScope,
    }
  }
  return {
    error: 'invalid_token',
    description: 'Token missing, expired, invalid, or not issued for this MCP resource',
  }
}

async function verifyJwtOrOpaqueToken(
  token: string,
  baseUrl: string,
  db: D1Database,
  audiences: string[],
  requiredScopes: string[],
): Promise<TokenVerificationResult> {
  const jwtResult = await verifyJwtAccessToken(token, baseUrl, db, audiences, requiredScopes)
  if (jwtResult.userId) {
    return {
      identity: { userId: jwtResult.userId, tokenKind: 'jwt', oauthClientId: jwtResult.oauthClientId ?? null },
      jwtReason: jwtResult.reason,
      opaqueReason: 'not_checked',
      scopes: jwtResult.scopes,
    }
  }

  const opaqueResult = await verifyOpaqueAccessToken(token, db, requiredScopes)
  if (opaqueResult.userId) {
    return {
      identity: { userId: opaqueResult.userId, tokenKind: 'opaque', oauthClientId: opaqueResult.oauthClientId ?? null },
      jwtReason: jwtResult.reason,
      opaqueReason: opaqueResult.reason,
      scopes: opaqueResult.scopes,
    }
  }

  return {
    identity: null,
    jwtReason: jwtResult.reason,
    opaqueReason: opaqueResult.reason,
    scopes: [],
  }
}

async function verifyJwtAccessToken(
  token: string,
  baseUrl: string,
  db: D1Database,
  audiences: string[],
  requiredScopes: string[],
): Promise<TokenLookupResult & { scopes: string[] }> {
  const keys = await queryAll<{ id: string; publicKey: string; alg: string | null }>(
    db,
    'SELECT id, publicKey, alg FROM jwks ORDER BY createdAt DESC',
  )

  if (!keys?.length) return { userId: null, reason: 'jwks_empty', scopes: [] }

  const jwks = createLocalJWKSet({
    keys: keys.map(k => ({
      ...JSON.parse(k.publicKey),
      kid: k.id,
      alg: k.alg ?? 'EdDSA',
    })),
  })

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: baseUrl,
      audience: audiences,
    })
    const scopes = parseScopesFromJwtPayload(payload.scope)
    const missingScope = requiredScopes.find(scope => !scopes.includes(scope))
    if (missingScope) {
      return { userId: null, reason: `${missingScope}_scope_missing`, scopes }
    }
    const oauthClientId = typeof payload.client_id === 'string'
      ? payload.client_id
      : typeof payload.azp === 'string'
        ? payload.azp
        : null
    return typeof payload.sub === 'string'
      ? { userId: payload.sub, reason: 'accepted', scopes, oauthClientId }
      : { userId: null, reason: 'subject_missing', scopes }
  } catch (error) {
    return { userId: null, reason: joseErrorReason(error), scopes: [] }
  }
}

async function verifyOpaqueAccessToken(
  token: string,
  db: D1Database,
  requiredScopes: string[],
): Promise<TokenLookupResult & { scopes: string[] }> {
  const hashedToken = await sha256Base64Url(token)
  const accessToken = await queryFirst<{
    userId: string | null
    expiresAt: number | null
    scopes: string | null
    client_disabled: number | null
    oauth_client_id: string | null
  }>(db, `
    SELECT oat.userId, oat.expiresAt, oat.scopes, oc.disabled AS client_disabled, oc.clientId AS oauth_client_id
    FROM oauthAccessToken oat
    LEFT JOIN oauthClient oc ON oc.clientId = oat.clientId
    WHERE oat.token = ?
    LIMIT 1
  `, [hashedToken])

  if (!accessToken?.userId || !accessToken.expiresAt) return { userId: null, reason: 'token_not_found', scopes: [] }
  if (accessToken.client_disabled) return { userId: null, reason: 'client_disabled', scopes: [] }

  // oauthAccessToken.expiresAt is stored as unix seconds (drizzle integer
  // timestamp mode) — multiply back to milliseconds before comparing.
  const expiresAtMs = accessToken.expiresAt * 1000
  if (Number.isNaN(expiresAtMs)) return { userId: null, reason: 'expiry_invalid', scopes: [] }
  if (expiresAtMs <= Date.now()) return { userId: null, reason: 'token_expired', scopes: [] }

  const scopes = parseTokenScopes(accessToken.scopes)
  const missingScope = requiredScopes.find(scope => !scopes.includes(scope))
  if (missingScope) return { userId: null, reason: `${missingScope}_scope_missing`, scopes }

  return { userId: accessToken.userId, reason: 'accepted', scopes, oauthClientId: accessToken.oauth_client_id }
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

function joseErrorReason(error: unknown) {
  if (!error || typeof error !== 'object') return 'jwt_invalid'
  const code = 'code' in error && typeof error.code === 'string' ? error.code : ''
  const claim = 'claim' in error && typeof error.claim === 'string' ? error.claim : ''
  if (code === 'ERR_JWT_EXPIRED') return 'jwt_expired'
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'jwt_signature_invalid'
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return 'jwt_key_not_found'
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && claim) return `jwt_claim_${claim}_invalid`
  return code ? `jwt_${code.toLowerCase()}` : 'jwt_invalid'
}

function logMcpAuth(
  event: H3Event,
  level: 'info' | 'warn',
  authEvent: string,
  fields: Record<string, unknown>,
) {
  console[level]('[MCP_AUTH]', JSON.stringify({
    event: authEvent,
    ray_id: getHeader(event, 'cf-ray') ?? null,
    user_agent: getHeader(event, 'user-agent') ?? null,
    ...fields,
  }))
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('base64url')
}

function parseTokenScopes(scopes: string | null) {
  if (!scopes) return []
  try {
    const parsed = JSON.parse(scopes)
    return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === 'string') : []
  } catch {
    return scopes.split(' ').filter(Boolean)
  }
}

function parseScopesFromJwtPayload(scopeClaim: unknown) {
  if (typeof scopeClaim !== 'string') return []
  return scopeClaim.split(' ').filter(Boolean)
}

function ensureForbiddenScopesAbsent(scopes: string[], forbiddenScopes?: string[]) {
  const blocked = (forbiddenScopes ?? []).find(scope => scopes.includes(scope))
  if (blocked) {
    throw createError({ statusCode: 403, statusMessage: `Token scope ${blocked} is not allowed for this MCP surface` })
  }
}

// siteId accepts the site's id, subdomain, or custom_domain — all three are exact,
// unambiguous identifiers (unlike a free-text business name), so resolving them
// directly here removes a list-then-match round trip for every site-scoped tool.
export async function requireMcpSite(
  event: H3Event,
  siteId: string,
  minimumRole: McpToolRole = 'editor',
): Promise<McpSiteContext> {
  const user = await requireMcpUser(event)

  type MemberSiteRow = { id: string; organization_id: string; role: string; member_id: string; organization_slug: string | null; subdomain: string | null; custom_domain: string | null; public_url: string | null }
  const memberSiteByColumn = async (column: 'id' | 'subdomain' | 'custom_domain') =>
    queryFirst<MemberSiteRow>(
      user.db,
      `
      SELECT s.id, s.organization_id, m.role, m.id AS member_id, o.slug as organization_slug, s.subdomain, s.custom_domain, s.public_url
      FROM sites s
      JOIN member m ON s.organization_id = m.organizationId
      LEFT JOIN organization o ON s.organization_id = o.id
      WHERE s.${column} = ? AND m.userId = ?
      LIMIT 1
    `,
      [siteId, user.userId],
    )

  // Check id first, then subdomain, then custom_domain — see note above on
  // why an OR across all three columns is ambiguous.
  const site = await memberSiteByColumn('id')
    ?? await memberSiteByColumn('subdomain')
    ?? await memberSiteByColumn('custom_domain')

  if (!site?.organization_id || !site.role) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  }

  const role = normalizeRole(site.role)
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
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
      memberId: site.member_id,
      role,
      organizationId: site.organization_id,
      siteId: site.id,
    })
  }

  return {
    ...user,
    siteId: site.id,
    organizationId: site.organization_id,
    organizationSlug: site.organization_slug || undefined,
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

export async function getActiveEntitlements(db: D1Database, organizationId: string, keys: string[], siteId?: string): Promise<Set<string>> {
  if (!keys.length) return new Set()
  const placeholders = keys.map(() => '?').join(', ')
  const siteFilter = siteId ? 'AND se.site_id = ?' : ''
  const bindings = siteId ? [organizationId, ...keys, siteId] : [organizationId, ...keys]
  const results = await queryAll<{ key: string }>(db, `
    SELECT se.key FROM site_entitlements se
    JOIN sites s ON s.id = se.site_id
    WHERE s.organization_id = ? AND se.key IN (${placeholders}) AND se.value = 'true' ${siteFilter}
  `, bindings)
  return new Set(results.map(r => r.key))
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
  return getHeaders(event) as HeadersInit
}
