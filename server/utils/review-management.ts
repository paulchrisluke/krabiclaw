export async function replyToReview(
  db: D1Database,
  organizationId: string,
  siteId: string,
  reviewId: string,
  reply: string,
) {
  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE reviews
    SET owner_reply = ?, owner_reply_at = ?, updated_at = ?
    WHERE id = ? AND site_id = ? AND organization_id = ?
  `).bind(reply, now, now, reviewId, siteId, organizationId).run()

  if (!result.meta.changes) {
    return { status: 404, data: { error: 'Review not found.' } }
  }

  return { status: 200, data: { review_id: reviewId, replied: true } }
}
