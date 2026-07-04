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

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string }>(
    db,
    `SELECT s.id
     FROM sites s
     JOIN organization o ON s.organization_id = o.id
     JOIN member om ON o.id = om.organizationId
     WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
     LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const body = await readBody(event) as Record<string, unknown>
  const policyType = body.policy_type === 'experience' ? 'experience' : 'reservation'
  const locationId = typeof body.location_id === 'string' ? body.location_id : null
  const experienceId = typeof body.experience_id === 'string' ? body.experience_id : null
  const locale = typeof body.locale === 'string' ? body.locale : 'en'

  try {
    const resolved = await resolveBookingPolicy(db, {
      siteId,
      policyType: policyType as BookingPolicyType,
      locationId,
      experienceId,
    })
    const preview = applyBookingPolicyPatch(
      resolved,
      validateBookingPolicyPatch(body, policyType as BookingPolicyType),
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
