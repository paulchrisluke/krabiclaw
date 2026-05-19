import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isDemoOrg } from '~/server/utils/demo'
import { processTranslationJobBatch } from '~/server/utils/translation-processor'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const jobId = getRouterParam(event, 'jobId')
  if (!siteId || !jobId) return jsonResponse({ error: 'Site ID and job ID are required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const result = await processTranslationJobBatch(db, env, site.organization_id, siteId, jobId)
    return jsonResponse({ success: true, result })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to run translation job' }, { status: 400 })
  }
})
