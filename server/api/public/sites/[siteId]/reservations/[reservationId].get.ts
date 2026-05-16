import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const reservationId = getRouterParam(event, 'reservationId')
  const email = getQuery(event).email as string

  if (!siteId || !reservationId || !email) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const reservation = await db.prepare(`
    SELECT name, date, time, guests, status
    FROM reservation_submissions
    WHERE id = ? AND site_id = ? AND LOWER(email) = LOWER(?)
    LIMIT 1
  `).bind(reservationId, siteId, email).first()

  if (!reservation) {
    return jsonResponse({ error: 'Reservation not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    reservation
  })
})
