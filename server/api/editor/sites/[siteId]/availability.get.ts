import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { readAvailabilityCalendar, type AvailabilityOwner } from '~/server/utils/availability'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseOwner(ownerType: string | undefined, ownerId: string | undefined): AvailabilityOwner | undefined {
  if (!ownerType && !ownerId) return undefined
  if (!ownerId || (ownerType !== 'location' && ownerType !== 'experience')) {
    throw createError({ statusCode: 400, statusMessage: 'owner_type and owner_id must identify a location or experience' })
  }
  return ownerType === 'location'
    ? { kind: 'location', locationId: ownerId }
    : { kind: 'experience', experienceId: ownerId }
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  const query = getQuery(event)
  const locationId = queryString(query.location_id)
  const from = queryString(query.from)
  const to = queryString(query.to)
  if (!locationId || !from || !to) {
    return jsonResponse({ error: 'location_id, from, and to are required' }, { status: 400 })
  }
  const owner = parseOwner(queryString(query.owner_type), queryString(query.owner_id))
  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  await assertResourceAccess(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: locationId,
  })
  const calendar = await readAvailabilityCalendar(db, {
    organizationId: site.organization_id,
    siteId,
    locationId,
    range: { from, to },
    owner,
  })
  return jsonResponse({ calendar })
})
