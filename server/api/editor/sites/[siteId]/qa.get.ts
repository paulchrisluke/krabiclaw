import { jsonResponse } from '~/server/utils/api-response'
import { listQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  const query = getQuery(event)
  const pagePath = typeof query.page_path === 'string' ? String(query.page_path) : null
  // `id` addresses one record whatever page it was filed under, which is what a
  // record's own URL needs; without it this is the scoped list it always was.
  const qaId = typeof query.id === 'string' && query.id ? String(query.id) : null
  return jsonResponse({ qa: await listQa(db, siteId, null, false, pagePath, 'en', qaId) })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
