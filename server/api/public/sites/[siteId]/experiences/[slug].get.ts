import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachAvailabilitySummaries, getExperienceBySlug } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])

  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const experienceRaw = await getExperienceBySlug(db, siteId, slug)
  if (!experienceRaw || experienceRaw.status === 'inactive') {
    return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  }
  const [experience] = await attachAvailabilitySummaries(db, site.organization_id, siteId, [experienceRaw])

  return jsonResponse({ experience })
})
