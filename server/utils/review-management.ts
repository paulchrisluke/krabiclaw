import { execute, type DbClient } from '~/server/db'

export async function replyToReview(
  db: DbClient,
  organizationId: string,
  siteId: string,
  reviewId: string,
  reply: string | null,
) {
  const now = new Date().toISOString()
  const trimmedReply = typeof reply === "string" ? reply.trim() : null
  const ownerReplyAt = trimmedReply ? now : null
  const result = await execute(db, `
    UPDATE reviews
    SET owner_reply = ?, owner_reply_at = ?, updated_at = ?
    WHERE id = ? AND site_id = ? AND organization_id = ?
  `, [trimmedReply, ownerReplyAt, now, reviewId, siteId, organizationId])

  if (!Number(result.meta.changes ?? 0)) {
    return { status: 404, data: { error: 'Review not found.' } }
  }

  return {
    status: 200,
    data: {
      review_id: reviewId,
      reply: trimmedReply,
      replied: Boolean(trimmedReply),
      cleared: !trimmedReply,
      updated_at: now,
    },
  }
}
