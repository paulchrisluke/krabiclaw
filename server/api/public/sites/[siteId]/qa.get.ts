import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listQa } from '~/server/utils/location-qa'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const site = await queryFirst<{ id: string }>(db, "SELECT id FROM sites WHERE id = ? AND status IN ('active', 'live', 'draft')", [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  return jsonResponse({ qa: await listQa(db, siteId, null, true) })
})
