import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(
    db,
    `SELECT s.id, s.organization_id
     FROM sites s
     JOIN organization o ON s.organization_id = o.id
     JOIN member om ON o.id = om.organizationId
     WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
     LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const query = getQuery(event)
  const policyType: BookingPolicyType = query.policy_type === 'experience' ? 'experience' : 'reservation'
  const scopeType: BookingPolicyScopeType = query.scope_type === 'location' || query.scope_type === 'experience' ? query.scope_type : 'site'
  const locationId = typeof query.location_id === 'string' ? query.location_id : null
  const experienceId = typeof query.experience_id === 'string' ? query.experience_id : null
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  try {
    const direct = await getDirectBookingPolicy(db, { siteId, policyType, scopeType, locationId, experienceId })
    const resolved = await resolveBookingPolicy(db, { siteId, policyType, locationId, experienceId })
    return jsonResponse({
      success: true,
      policy: direct,
      resolved_policy: resolved,
      summary: renderBookingPolicySummary(resolved, locale),
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to load booking policy' }, { status: 400 })
  }
})
