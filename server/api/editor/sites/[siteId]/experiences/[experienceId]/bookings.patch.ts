import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateBookingStatus } from '~/server/utils/experiences'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db
    .prepare(
      `SELECT s.id FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1`,
    )
    .bind(siteId, session.user.id)
    .first<{ id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: { booking_id?: string; status?: string }
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.booking_id || !['pending', 'confirmed', 'cancelled'].includes(body.status ?? '')) {
    return jsonResponse({ error: 'booking_id and valid status required' }, { status: 400 })
  }

  const ok = await updateBookingStatus(db, siteId, experienceId, body.booking_id, body.status as 'pending' | 'confirmed' | 'cancelled')
  if (!ok) return jsonResponse({ error: 'Booking not found' }, { status: 404 })
  return jsonResponse({ updated: true })
})
