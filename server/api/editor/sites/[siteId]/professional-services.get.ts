import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getProfessionalServiceContent } from '~/server/utils/professional-services-editor'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB || env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string }>(db, `
    SELECT s.id
      FROM sites s
      JOIN member m ON m.organizationId = s.organization_id
     WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor')
     LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    return jsonResponse({ success: true, ...(await getProfessionalServiceContent(db, siteId)) })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to load professional-service content' }, { status: 500 })
  }
})
