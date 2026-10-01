import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listPublicBookingSessions } from '~/server/utils/public-session-booking'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

/**
 * The sessions a guest can book.
 *
 * Only sessions that exist: there is no computed schedule to fall back on, so
 * a product whose sessions have not been generated returns an empty list and
 * the page says there is nothing to book. It does not invent slots from a
 * recurrence rule the merchant has not materialized.
 *
 * `location_id` scopes the answer to one branch. A product page belongs to a
 * branch, and two branches can run the same class at the same hour: without
 * the scope the page would offer occurrences of the other one, and the guest
 * would be booked into a class they did not choose.
 */
export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const slug = getRouterParam(event, 'slug')
  if (!organizationId || !slug) return jsonResponse({ error: 'organizationId and slug required' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  return jsonResponse(await listPublicBookingSessions(db, organizationId, slug, getQuery(event).location_id))
})
