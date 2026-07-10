// PATCH /api/editor/sites/[siteId]/reviews/[reviewId]
// Allows owners/admins to set owner_reply, change status (approve/hide)
import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { replyToReview } from '~/server/utils/review-management'
import { execute } from '~/server/db'
import { updateOwnerEnteredSiteReview } from '~/server/utils/site-reviews'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reviewId = getRouterParam(event, 'reviewId')

  const { db, site } = await requireSiteAccess(event, siteId!, ['owner', 'admin'])

  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const ownerEntryFields = [
    'author_name', 'rating', 'title', 'content', 'collection_method',
    'original_review_date', 'original_reference', 'publication_authorized',
  ]
  if (ownerEntryFields.some(field => field in body)) {
    try {
      await updateOwnerEnteredSiteReview(db, { organizationId: site.organization_id, siteId: siteId! }, reviewId!, body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review update failed'
      return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
    }
  }

  if ('owner_reply' in body) {
    const reply = body.owner_reply == null ? null : typeof body.owner_reply === 'string' ? body.owner_reply : undefined
    if (reply === undefined) return jsonResponse({ error: 'owner_reply must be a string or null' }, { status: 400 })
    const result = await replyToReview(db, site.organization_id, siteId!, reviewId!, reply)
    if (body.status === undefined && !ownerEntryFields.some(field => field in body)) {
      if (result.status >= 400) {
        return jsonResponse(result.data, { status: result.status })
      }
      return jsonResponse({ updated: true })
    }
  }

  if (body.status !== undefined && !['pending', 'approved', 'rejected'].includes(String(body.status))) {
    return jsonResponse({ error: 'Invalid review status' }, { status: 400 })
  }

  const allowed = ['status']
  const sets = ['updated_at = ?']
  const params: ApiRecord[] = [new Date().toISOString()]
  for (const key of allowed) {
    if (key in body) { sets.push(`${key} = ?`); params.push(body[key] ?? null) }
  }
  if (sets.length === 1) return jsonResponse({ updated: true })
  params.push(reviewId, siteId)

  await execute(db, `UPDATE reviews SET ${sets.join(', ')} WHERE id = ? AND site_id = ?`, params)
  if (body.status === 'approved' || body.status === 'rejected') {
    await execute(db, `
      UPDATE review_media
      SET status = ?, updated_at = ?
      WHERE review_id = ?
        AND status != 'deleted'
    `, [body.status === 'approved' ? 'approved' : 'rejected', new Date().toISOString(), reviewId])
  }

  return jsonResponse({ updated: true })
})
