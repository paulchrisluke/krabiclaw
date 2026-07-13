import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { createOwnerEnteredSiteReview } from '~/server/utils/site-reviews'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin'])
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    const result = await createOwnerEnteredSiteReview(db, {
      organizationId: site.organization_id,
      siteId,
      enteredByUserId: session.user.id,
    }, body as never)
    return jsonResponse(result, { status: 201 })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Review creation failed' }, { status: 400 })
  }
})
