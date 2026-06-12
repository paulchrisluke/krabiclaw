import { createError, getHeaders, type H3Event } from 'h3'
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

export async function getVisibleRoleForSite(
  event: H3Event,
  siteId: string,
): Promise<McpToolRole | null> {
  try {
    const site = await requireMcpSite(event, siteId, 'editor')
    return site.role
  } catch {
    return null
  }
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
