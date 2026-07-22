import { jsonResponse } from '~/server/utils/api-response'
import { getExperienceById, resolveEffectiveTimeSlots, upsertSlotOverride } from '~/server/utils/experiences'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const { db, session, site } = await requireSiteAccess(event, siteId, 'context')
  const experience = await getExperienceById(db, siteId, experienceId)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: experience.location_id,
  })

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const overrideDate = String(body.override_date ?? '')
  const timeSlot = String(body.time_slot ?? '')
  const status = String(body.status ?? '')

  // Validate YYYY-MM-DD format
  if (overrideDate && !/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    return jsonResponse({ error: 'override_date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  if (overrideDate) {
    const parsedDate = new Date(`${overrideDate}T00:00:00.000Z`)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== overrideDate) {
      return jsonResponse({ error: 'override_date is not a valid calendar date' }, { status: 400 })
    }
  }

  if (status !== 'closed' && status !== 'open') {
    return jsonResponse({ error: 'status must be "closed" or "open"' }, { status: 400 })
  }

  const capacityOverride = body.capacity_override == null || body.capacity_override === '' ? null : Number(body.capacity_override)
  if (capacityOverride !== null && (!Number.isFinite(capacityOverride) || capacityOverride < 0)) {
    return jsonResponse({ error: 'capacity_override must be a non-negative number' }, { status: 400 })
  }

  // Closing a slot only makes sense if it's part of the existing schedule.
  // Opening one is allowed to add a one-off extra session outside the
  // recurring/flat schedule (e.g. a special date with no regular slots).
  const effectiveSlots = resolveEffectiveTimeSlots(experience, overrideDate)
  if (status === 'closed' && !effectiveSlots.includes(timeSlot)) {
    return jsonResponse({ error: 'time_slot is not an effective slot for that date' }, { status: 400 })
  }

  const override = await upsertSlotOverride(
    db,
    site.organization_id,
    siteId,
    experienceId,
    {
      override_date: overrideDate,
      time_slot: timeSlot,
      status,
      capacity_override: capacityOverride,
      note: body.note ? String(body.note).trim() : null,
    },
    session.user.id,
  )

  return jsonResponse({ override }, { status: 201 })
})
