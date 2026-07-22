import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import {
  applyBookingPolicyPatch,
  renderBookingPolicySummary,
  resolveBookingPolicy,
  validateBookingPolicyPatch,
  type BookingPolicyType,
} from '~/server/utils/booking-policies'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string; member_id: string; member_role: string }>(
    db,
    `SELECT s.id, s.organization_id, om.id AS member_id, om.role AS member_role
     FROM sites s
     JOIN organization o ON s.organization_id = o.id
     JOIN member om ON o.id = om.organizationId
     WHERE s.id = ? AND om.userId = ?
     LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const body = await readBody(event) as Record<string, unknown>
  const policyType = body.policy_type === 'experience' ? 'experience' : 'reservation'
  const locationId = typeof body.location_id === 'string' ? body.location_id : null
  const experienceId = typeof body.experience_id === 'string' ? body.experience_id : null
  const locale = typeof body.locale === 'string' ? body.locale : 'en'

  let resourceLocationId = locationId
  if (!resourceLocationId && experienceId) {
    const experience = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId])
    resourceLocationId = experience?.location_id ?? null
  }
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId,
  })

  try {
    const resolved = await resolveBookingPolicy(db, {
      siteId,
      policyType: policyType as BookingPolicyType,
      locationId,
      experienceId,
    })
    const preview = applyBookingPolicyPatch(
      resolved,
      await validateBookingPolicyPatch(body, policyType as BookingPolicyType),
    )
    return jsonResponse({
      success: true,
      resolved_policy: preview,
      summary: renderBookingPolicySummary(preview, locale),
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to preview booking policy' }, { status: 400 })
  }
})
