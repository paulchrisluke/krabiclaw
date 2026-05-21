import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getExperienceBySlug } from '~/server/utils/experiences'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await db
    .prepare(`SELECT id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`)
    .bind(siteId)
    .first<{ id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const experience = await getExperienceBySlug(db, siteId, slug)
  if (!experience || experience.status === 'inactive') {
    return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  }

  return jsonResponse({ experience })
})
