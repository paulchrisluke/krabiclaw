import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import {
  resolveAvailabilityOwner,
  setAvailability,
  type AvailabilityChange,
  type AvailabilityOwner,
} from '~/server/utils/availability'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

function parseOwner(value: unknown): AvailabilityOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'owner is required' })
  }
  const owner = value as Record<string, unknown>
  if (owner.kind === 'location' && typeof owner.locationId === 'string' && owner.locationId) {
    return { kind: 'location', locationId: owner.locationId }
  }
  if (owner.kind === 'experience' && typeof owner.experienceId === 'string' && owner.experienceId) {
    return { kind: 'experience', experienceId: owner.experienceId }
  }
  throw createError({ statusCode: 400, statusMessage: 'owner must identify a location or experience' })
}

function parseChange(value: unknown): AvailabilityChange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Each availability change must be an object' })
  }
  const change = value as Record<string, unknown>
  const base = {
    override_date: typeof change.override_date === 'string' ? change.override_date : '',
    time_slot: typeof change.time_slot === 'string' ? change.time_slot : '',
  }
  if (change.directive === 'inherit') return { ...base, directive: 'inherit' }
  if (change.directive !== 'set' || (change.status !== 'open' && change.status !== 'closed')) {
    throw createError({ statusCode: 400, statusMessage: 'Each change must inherit or set open or closed availability' })
  }
  return {
    ...base,
    directive: 'set',
    status: change.status,
    capacity_override: change.capacity_override === null || change.capacity_override === undefined
      ? null
      : Number(change.capacity_override),
    note: typeof change.note === 'string' ? change.note : null,
  }
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })
  const body = await readRequiredBody<Record<string, unknown>>(event)
  const owner = parseOwner(body.owner)
  if (!Array.isArray(body.changes)) {
    return jsonResponse({ error: 'changes must be an array' }, { status: 400 })
  }
  const changes = body.changes.map(parseChange)
  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')
  const ownerRecord = await resolveAvailabilityOwner(db, site.organization_id, siteId, owner)
  await assertResourceAccess(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: ownerRecord.location_id,
  })
  const overrides = await setAvailability(db, {
    organizationId: site.organization_id,
    siteId,
    owner,
    changes,
    actorUserId: session.user.id,
  })
  return jsonResponse({ overrides })
})
