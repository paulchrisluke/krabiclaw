import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicBlawbyData } from '~/server/utils/professional-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const site = await queryFirst<{ id: string; vertical: string; theme_id: string }>(db, `
    SELECT id, vertical, theme_id
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
     LIMIT 1
  `, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  if (site.vertical !== 'professional_service' && site.theme_id !== 'blawby-theme-v1') {
    return jsonResponse({ error: 'Blawby is not enabled for this site' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    ...(await getPublicBlawbyData(db, siteId)),
  })
})
