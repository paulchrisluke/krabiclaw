import { createError, getHeader, getHeaders, type H3Event } from 'h3'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { getAuthSession, type CloudflareEnv } from '~/server/utils/auth'

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
}

export interface McpSiteContext extends McpUserContext {
  siteId: string
  organizationId: string
  role: McpToolRole
}

export async function requireMcpUser(event: H3Event): Promise<McpUserContext> {
  const env = event.context.cloudflare?.env as CloudflareEnv | undefined
  const db = env?.DB
  if (!env || !db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return verifyBearerToken(authHeader.slice(7), env, db)
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return {
    env,
    db,
    userId: session.user.id,
    isPlatformAdmin: (session.user as { role?: string }).role === 'admin',
  }
}

async function verifyBearerToken(token: string, env: CloudflareEnv, db: D1Database): Promise<McpUserContext> {
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  const { results: keys } = await db
    .prepare('SELECT id, publicKey, alg FROM jwks ORDER BY createdAt DESC')
    .all<{ id: string; publicKey: string; alg: string | null }>()

  if (!keys?.length) {
    throw createError({ statusCode: 401, statusMessage: 'No signing keys configured' })
  }

  const jwks = createLocalJWKSet({
    keys: keys.map(k => ({
      ...JSON.parse(k.publicKey),
      kid: k.id,
      alg: k.alg ?? 'EdDSA',
    })),
  })

  let userId: string
  try {
    const { payload } = await jwtVerify(token, jwks, {
      // Better Auth sets iss = baseURL + basePath (e.g. https://krabiclaw.com/api/auth)
      issuer: `${baseUrl}/api/auth`,
      audience: [`${baseUrl}/api/mcp`, 'https://krabiclaw.com/api/mcp'],
    })
    if (!payload.sub) throw new Error('missing sub')
    userId = payload.sub
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
  }

  const user = await db
    .prepare('SELECT role FROM user WHERE id = ? LIMIT 1')
    .bind(userId)
    .first<{ role?: string }>()

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'User not found' })
  }

  return {
    env,
    db,
    userId,
    isPlatformAdmin: user.role === 'admin',
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
      SELECT organization_id
      FROM sites
      WHERE id = ?
      LIMIT 1
    `).bind(siteId).first<{ organization_id: string }>()

    if (!site?.organization_id) {
      throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
    }

    return {
      ...user,
      siteId,
      organizationId: site.organization_id,
      role: 'owner',
    }
  }

  const site = await user.db.prepare(`
    SELECT s.organization_id, m.role
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `).bind(siteId, user.userId).first<{ organization_id: string; role: string }>()

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
    role,
  }
}

export async function getVisibleSiteContext(
  event: H3Event,
  siteId: string,
): Promise<{ role: McpToolRole; organizationId: string } | null> {
  try {
    const site = await requireMcpSite(event, siteId, 'editor')
    return { role: site.role, organizationId: site.organizationId }
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

export async function getActiveEntitlements(db: D1Database, organizationId: string, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set()
  const placeholders = keys.map(() => '?').join(', ')
  const { results } = await db.prepare(`
    SELECT key FROM organization_entitlements
    WHERE organization_id = ? AND key IN (${placeholders}) AND value = 'true'
  `).bind(organizationId, ...keys).all<{ key: string }>()
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
