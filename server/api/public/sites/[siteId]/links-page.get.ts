import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicLinksPage } from '~/server/utils/site-links'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const linksPage = await getPublicLinksPage(db, siteId)
  if (!linksPage) return jsonResponse({ error: 'Links page not found' }, { status: 404 })

  return jsonResponse({ success: true, ...linksPage })
})
