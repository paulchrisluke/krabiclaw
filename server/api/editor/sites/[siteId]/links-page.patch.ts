import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { SiteLinksValidationError, upsertLinksPage, type LinkItemUpdateInput, type LinksPageUpdateInput } from '~/server/utils/site-links'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site, session } = await requireSiteAccess(event, siteId)

  try {
    const body = await readBody<{ page?: LinksPageUpdateInput; items?: LinkItemUpdateInput[] }>(event)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid links page payload' }, { status: 400 })
    }
    if (!Array.isArray(body.items)) {
      return jsonResponse({ error: 'Invalid links page payload' }, { status: 400 })
    }
    const result = await upsertLinksPage(db, {
      organizationId: site.organization_id,
      siteId,
      page: body.page ?? {},
      items: body.items,
      updatedBy: session.user.id,
    })
    return jsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    if (error instanceof SiteLinksValidationError) {
      return jsonResponse({ error: error.message }, { status: 400 })
    }
    console.error('Links page save failed:', error)
    return jsonResponse({ error: 'Unable to save links page' }, { status: 500 })
  }
})
