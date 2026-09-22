import { getGuestRequest, getThreadOperationalRecord } from '~/server/domain/requests'
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashReservationCancelToken, readBearerToken } from '~/server/utils/reservation-cancel-token'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * What a guest's cancellation link refers to.
 *
 * One route for both kinds: a booking and a reservation differ in what holds
 * the seats, not in what the guest is shown, and the thread's `kind` already
 * says which it is. The when and the party size are read from the operational
 * record, never from the thread — the thread stopped carrying a copy of them
 * precisely so the two could not disagree.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const requestId = getRouterParam(event, 'requestId')
  const token = readBearerToken(event.req.headers.get('authorization'))
  if (!siteId || !requestId || !token) {
    return jsonResponse({ error: 'Missing required parameters' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const tokenHash = await hashReservationCancelToken(token)
  const spendable = await queryFirst<{ id: string }>(db, `
    SELECT id FROM requests
     WHERE id = ? AND site_id = ? AND kind IN ('reservation', 'booking')
       AND json_extract(payload_json, '$.cancellation.token_hash') = ?
       AND json_extract(payload_json, '$.cancellation.used_at') IS NULL
       AND json_extract(payload_json, '$.cancellation.expires_at') > ?
     LIMIT 1
  `, [requestId, siteId, tokenHash, new Date().toISOString()])
  if (!spendable) return jsonResponse({ error: 'Booking not found' }, { status: 404 })

  const request = await getGuestRequest(db, requestId, siteId)
  const record = request ? await getThreadOperationalRecord(db, request.id) : null
  if (!request || request.kind === 'contact' || !record) {
    return jsonResponse({ error: 'Booking not found' }, { status: 404 })
  }

  return jsonResponse({
    success: true,
    booking: {
      kind: record.kind,
      name: request.payload.guest.name,
      starts_at: record.starts_at,
      timezone: record.timezone,
      guests: `${record.party_size}${request.payload.party_size_is_minimum ? '+' : ''}`,
      status: record.status,
      product_name: record.product_name,
      location_id: record.location_id,
    },
  })
})
