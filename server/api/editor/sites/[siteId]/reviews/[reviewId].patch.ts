// PATCH /api/editor/sites/[siteId]/reviews/[reviewId]
// Allows owners/admins to set owner_reply, change status (approve/hide)
import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { replyToReview } from '~/server/utils/review-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reviewId = getRouterParam(event, 'reviewId')

  const { db, site } = await requireSiteAccess(event, siteId!, ['owner', 'admin'])

  const body = await readBody(event)
  if (typeof body.owner_reply === 'string') {
    const result = await replyToReview(db, site.organization_id, siteId!, reviewId!, body.owner_reply)
    if (body.status === undefined) {
      if (result.status >= 400) {
        return jsonResponse(result.data, { status: result.status })
      }
      return jsonResponse({ updated: true })
    }
  }

  const allowed = ['owner_reply', 'owner_reply_at', 'status']
  const sets = ['updated_at = ?']
  const params: ApiRecord[] = [new Date().toISOString()]
  for (const key of allowed) {
    if (key in body) { sets.push(`${key} = ?`); params.push(body[key] ?? null) }
  }
  if (body.owner_reply !== undefined && !('owner_reply_at' in body)) {
    sets.push('owner_reply_at = ?')
    params.push(body.owner_reply ? new Date().toISOString() : null)
  }
  params.push(reviewId, siteId)

  await db.prepare(
    `UPDATE reviews SET ${sets.join(', ')} WHERE id = ? AND site_id = ?`
  ).bind(...params).run()

  return jsonResponse({ updated: true })
})
