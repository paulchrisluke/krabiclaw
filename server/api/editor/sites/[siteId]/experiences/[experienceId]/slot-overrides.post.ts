import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getExperienceById, resolveEffectiveTimeSlots, upsertSlotOverride } from '~/server/utils/experiences'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db
    .prepare(
      `SELECT s.id, s.organization_id FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1`,
    )
    .bind(siteId, session.user.id)
    .first<{ id: string; organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const experience = await getExperienceById(db, siteId, experienceId)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  let body: Record<string, ApiValue>
  try { body = await readBody(event) } catch { return jsonResponse({ error: 'Invalid request body' }, { status: 400 }) }

  const overrideDate = String(body.override_date ?? '')
  const timeSlot = String(body.time_slot ?? '')
  const status = String(body.status ?? '')

  // Validate YYYY-MM-DD format
  if (overrideDate && !/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    return jsonResponse({ error: 'override_date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  if (status !== 'closed' && status !== 'open') {
    return jsonResponse({ error: 'status must be "closed" or "open"' }, { status: 400 })
  }

  const capacityOverride = body.capacity_override == null || body.capacity_override === '' ? null : Number(body.capacity_override)
  if (capacityOverride !== null && (!Number.isFinite(capacityOverride) || capacityOverride < 0)) {
    return jsonResponse({ error: 'capacity_override must be a non-negative number' }, { status: 400 })
  }

  const effectiveSlots = resolveEffectiveTimeSlots(experience, overrideDate)
  if (!effectiveSlots.includes(timeSlot)) {
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
