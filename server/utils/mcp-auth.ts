import { createError, getHeader, getHeaders, type H3Event } from 'h3'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

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
}

export interface McpSiteContext extends McpUserContext {
  siteId: string
  organizationId: string
  organizationSlug?: string
  role: McpToolRole
}

interface TokenLookupResult {
  userId: string | null
  reason: string
}

interface VerifiedTokenIdentity {
  userId: string
  tokenKind: 'jwt' | 'opaque'
}

interface TokenVerificationResult {
  identity: VerifiedTokenIdentity | null
  jwtReason: string
  opaqueReason: string
  scopes: string[]
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
  const normalizedOptions: RequireMcpUserOptions = {
    ...options,
    forbiddenScopes: options.forbiddenScopes ?? (options.requiredScopes?.includes('platform_admin') ? [] : ['platform_admin']),
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
  const user = {
    env,
    db,
    userId: session.user.id,
    isPlatformAdmin: isPlatformAdmin(
      {
        role: (session.user as { role?: string | null }).role ?? null,
        email: session.user.email ?? null,
      },
      env,
    ),
    scopes: normalizedOptions.requiredScopes ?? ['tenant'],
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
    : [`${baseUrl}/api/mcp`, 'https://krabiclaw.com/api/mcp']
  const requiredScopes = options.requiredScopes?.length ? options.requiredScopes : ['tenant']

  const verification = await verifyJwtOrOpaqueToken(token, baseUrl, db, audiences, requiredScopes)
  if (!verification.identity) {
    logMcpAuth(event, 'warn', 'credential_rejected', {
      token_fingerprint: tokenFingerprint,
      token_shape: token.split('.').length === 3 ? 'jwt' : 'opaque',
      jwt_reason: verification.jwtReason,
      opaque_reason: verification.opaqueReason,
    })
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }
  const identity = verification.identity
  ensureForbiddenScopesAbsent(verification.scopes, options.forbiddenScopes)

  const user = await db
    .prepare('SELECT role, email FROM user WHERE id = ? LIMIT 1')
    .bind(identity.userId)
    .first<{ role?: string; email?: string | null }>()

  if (!user) {
    logMcpAuth(event, 'warn', 'credential_rejected', {
      token_fingerprint: tokenFingerprint,
      token_kind: identity.tokenKind,
      reason: 'user_not_found',
    })
    throw createError({ statusCode: 401, statusMessage: 'User not found' })
  }

  logMcpAuth(event, 'info', 'credential_accepted', {
    token_fingerprint: tokenFingerprint,
    token_kind: identity.tokenKind,
  })

  return {
    env,
    db,
    userId: identity.userId,
    isPlatformAdmin: isPlatformAdmin(
      {
        role: user.role ?? null,
        email: user.email ?? null,
      },
      env,
    ),
    scopes: verification.scopes,
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
      identity: { userId: jwtResult.userId, tokenKind: 'jwt' },
      jwtReason: jwtResult.reason,
      opaqueReason: 'not_checked',
      scopes: jwtResult.scopes,
    }
  }

  const opaqueResult = await verifyOpaqueAccessToken(token, db, requiredScopes)
  if (opaqueResult.userId) {
    return {
      identity: { userId: opaqueResult.userId, tokenKind: 'opaque' },
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
  const { results: keys } = await db
    .prepare('SELECT id, publicKey, alg FROM jwks ORDER BY createdAt DESC')
    .all<{ id: string; publicKey: string; alg: string | null }>()

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
    return typeof payload.sub === 'string'
      ? { userId: payload.sub, reason: 'accepted', scopes }
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
  const accessToken = await db.prepare(`
    SELECT oat.userId, oat.expiresAt, oat.scopes, oc.disabled AS client_disabled
    FROM oauthAccessToken oat
    LEFT JOIN oauthClient oc ON oc.clientId = oat.clientId
    WHERE oat.token = ?
    LIMIT 1
  `).bind(hashedToken).first<{
    userId: string | null
    expiresAt: string | null
    scopes: string | null
    client_disabled: number | null
  }>()

  if (!accessToken?.userId || !accessToken.expiresAt) return { userId: null, reason: 'token_not_found', scopes: [] }
  if (accessToken.client_disabled) return { userId: null, reason: 'client_disabled', scopes: [] }

  const expiresAt = new Date(accessToken.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) return { userId: null, reason: 'expiry_invalid', scopes: [] }
  if (expiresAt.getTime() <= Date.now()) return { userId: null, reason: 'token_expired', scopes: [] }

  const scopes = parseTokenScopes(accessToken.scopes)
  const missingScope = requiredScopes.find(scope => !scopes.includes(scope))
  if (missingScope) return { userId: null, reason: `${missingScope}_scope_missing`, scopes }

  return { userId: accessToken.userId, reason: 'accepted', scopes }
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

export async function requireMcpSite(
  event: H3Event,
  siteId: string,
  minimumRole: McpToolRole = 'editor',
): Promise<McpSiteContext> {
  const user = await requireMcpUser(event)

  if (user.isPlatformAdmin) {
    const site = await user.db.prepare(`
      SELECT s.organization_id, o.slug as organization_slug
      FROM sites s
      LEFT JOIN organization o ON s.organization_id = o.id
      WHERE s.id = ?
      LIMIT 1
    `).bind(siteId).first<{ organization_id: string; organization_slug: string | null }>()

    if (!site?.organization_id) {
      throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
    }

    return {
      ...user,
      siteId,
      organizationId: site.organization_id,
      organizationSlug: site.organization_slug || undefined,
      role: 'owner',
    }
  }

  const site = await user.db.prepare(`
    SELECT s.organization_id, m.role, o.slug as organization_slug
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    LEFT JOIN organization o ON s.organization_id = o.id
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `).bind(siteId, user.userId).first<{ organization_id: string; role: string; organization_slug: string | null }>()

  if (!site?.organization_id || !site.role) {
    throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  }

  const role = normalizeRole(site.role)
  if (!role || ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  return {
    ...user,
    siteId,
    organizationId: site.organization_id,
    organizationSlug: site.organization_slug || undefined,
    role,
  }
}

export async function getVisibleSiteContext(
  event: H3Event,
  siteId: string,
): Promise<{ role: McpToolRole; organizationId: string; siteId: string } | null> {
  try {
    const site = await requireMcpSite(event, siteId, 'editor')
    return { role: site.role, organizationId: site.organizationId, siteId }
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
  const { results } = await db.prepare(`
    SELECT se.key FROM site_entitlements se
    JOIN sites s ON s.id = se.site_id
    WHERE s.organization_id = ? AND se.key IN (${placeholders}) AND se.value = 'true' ${siteFilter}
  `).bind(...bindings).all<{ key: string }>()
  return new Set((results ?? []).map(r => r.key))
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
