import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteOwnerEnteredSiteReview } from '~/server/utils/site-reviews'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reviewId = getRouterParam(event, 'reviewId')
  if (!siteId || !reviewId) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, siteId, ['owner', 'admin'])
  try {
    return jsonResponse(await deleteOwnerEnteredSiteReview(db, {
      organizationId: site.organization_id,
      siteId,
    }, reviewId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review deletion failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
