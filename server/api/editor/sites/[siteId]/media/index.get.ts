// GET /api/editor/sites/[siteId]/media?kind=image&locationId=xxx&limit=50&offset=0
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getMediaAsset, listMediaAssets } from '~/server/utils/media-asset-manager'
import { queryFirst, type DbClient } from '~/server/db'

async function verifySiteAccess(db: DbClient, userId: string, siteId: string): Promise<boolean> {
  const site = await queryFirst(db, `
    SELECT s.id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `, [siteId, userId])

  return Boolean(site)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const hasAccess = await verifySiteAccess(db, session.user.id, siteId)
  if (!hasAccess) return jsonResponse({ error: 'Forbidden' }, { status: 403 })

  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id : undefined
  const kind = typeof query.kind === 'string' ? query.kind : undefined
  const locationId = typeof query.locationId === 'string' ? query.locationId : undefined
  const search = typeof query.search === 'string' ? query.search : undefined
  const parsedLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number.NaN
  const parsedOffset = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : Number.NaN
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0

  if (id) {
    const asset = await getMediaAsset(db, id, siteId)
    return jsonResponse({ media: asset ? [asset] : [] })
  }

  const assets = await listMediaAssets(db, siteId, { kind, locationId, search, limit, offset })
  return jsonResponse({ media: assets })
})
