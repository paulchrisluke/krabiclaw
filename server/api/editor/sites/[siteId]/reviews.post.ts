import { jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { createOwnerEnteredSiteReview } from '~/server/utils/site-reviews'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, env, session, site } = await requireSiteAccess(event, siteId, 'context')
  assertOrganizationAccess(site.member_role)
  const body = await readStrictBody(event, {
    author_name: 'string', rating: 'number', title: 'nullable-string', content: 'string',
    collection_method: 'string', original_review_date: 'nullable-string',
    original_reference: 'nullable-string', publication_authorized: 'boolean', status: 'string',
  })
  try {
    const result = await createOwnerEnteredSiteReview(db, {
      organizationId: site.organization_id, siteId, enteredByUserId: session.user.id, }, body as never, env)
    return jsonResponse(result, { status: 201 })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Review creation failed' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
