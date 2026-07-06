import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachAvailabilitySummaries, listExperiences } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])

  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const experiencesRaw = await listExperiences(db, siteId, { activeOnly: true })
  const experiences = await attachAvailabilitySummaries(db, site.organization_id, siteId, experiencesRaw)
  return jsonResponse({ experiences })
})
