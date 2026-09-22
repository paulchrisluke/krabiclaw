import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listSiteReviews } from '~/server/utils/site-reviews'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const db = cloudflareEnv(event).db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const site = await queryFirst<{ id: string }>(db, "SELECT id FROM organization WHERE id = ? AND status = 'active'", [organizationId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  return jsonResponse({ reviews: await listSiteReviews(db, organizationId, { publishedOnly: true }) })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
