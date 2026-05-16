import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')
  
  let body: { email?: string }
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid body' }, { status: 400 }) }
  
  const email = body.email
  if (!siteId || !reservationId || !email) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  // Verify and update
  const result = await db.prepare(`
    UPDATE reservation_submissions
    SET status = 'cancelled'
    WHERE id = ? AND site_id = ? AND LOWER(email) = LOWER(?) AND status != 'cancelled'
  `).bind(reservationId, siteId, email).run()

  if (result.meta.changes === 0) {
    return jsonResponse({ error: 'Reservation not found or already cancelled' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    message: 'Reservation cancelled successfully'
  })
})
