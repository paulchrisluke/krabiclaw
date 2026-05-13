// DELETE /api/editor/sites/[siteId]/media/[assetId]
// Soft-deletes in DB and hard-deletes from Cloudflare Images or R2.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteMediaAsset } from '~/server/utils/media-asset-manager'

async function verifySiteAccess(db: any, userId: string, siteId: string): Promise<boolean> {
  const site = await db.prepare(`
    SELECT s.id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, userId).first()

  return Boolean(site)
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const assetId = getRouterParam(event, 'assetId')
  if (!siteId || !assetId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const hasAccess = await verifySiteAccess(db, session.user.id, siteId)
  if (!hasAccess) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  await deleteMediaAsset(db, env, assetId, siteId)
  return jsonResponse({ deleted: true })
})
