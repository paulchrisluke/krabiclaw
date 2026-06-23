import { getGoogleBusinessData } from '../../utils/google-business'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { execute } from '~/server/db'

const decodePubSubData = (data?: string) => {
  if (!data) return null
  try {
    return JSON.parse(atob(data))
  } catch {
    return data
  }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const url = getRequestURL(event)
  const expectedToken = env.GOOGLE_PUBSUB_PUSH_TOKEN

  if (!expectedToken || url.searchParams.get('token') !== expectedToken) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await readBody<{
    message?: {
      data?: string
      attributes?: Record<string, string>
      messageId?: string
      publishTime?: string
    }
    subscription?: string
  }>(event)
  const decoded = decodePubSubData(body.message?.data)
  const payload = typeof decoded === 'object' && decoded !== null ? decoded as ApiRecord : {}
  const eventType = String(payload.notificationType ?? body.message?.attributes?.notificationType ?? 'UNKNOWN')
  const locationName = String(payload.locationName ?? payload.location_name ?? body.message?.attributes?.locationName ?? '')
  const reviewName = String(payload.reviewName ?? payload.review_name ?? body.message?.attributes?.reviewName ?? '')
  const eventId = body.message?.messageId ?? crypto.randomUUID()
  const locationId = locationName ? locationName.split('/').pop() : locationName

  await execute(env.DB,
    `INSERT OR IGNORE INTO google_business_events (id, google_location_id, event_type, payload, status)
     VALUES (?, ?, ?, ?, 'received')`,
    [eventId, locationId, eventType, JSON.stringify({ body, decoded, reviewName })]
  )

  try {
    // Get location from event data for sync
    await getGoogleBusinessData(env, locationId)
    await execute(env.DB,
      `UPDATE google_business_events SET status = 'synced' WHERE id = ?`,
      [eventId]
    )
    return jsonResponse({ ok: true })
  } catch (error) {
    await execute(env.DB,
      `UPDATE google_business_events SET status = 'sync_failed' WHERE id = ?`,
      [eventId]
    )
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 202 })
  }
})
