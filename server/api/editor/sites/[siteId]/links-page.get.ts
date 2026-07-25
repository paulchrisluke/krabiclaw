import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { defaultLinksPage, getLinksPage } from '~/server/utils/site-links'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId)
  const result = await getLinksPage(db, siteId)

  return jsonResponse({
    page: result.page ?? defaultLinksPage({
      organizationId: site.organization_id,
      siteId,
      brandName: site.brand_name,
    }),
    items: result.items,
  })
})
