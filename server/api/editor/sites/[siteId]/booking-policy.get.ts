import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { getDirectBookingPolicy, renderBookingPolicySummary, resolveBookingPolicy, validateBookingPolicyScope, type BookingPolicyScopeType, type BookingPolicyType } from '~/server/utils/booking-policies'
import { assertResourceAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

  const query = getQuery(event)
  const policyType: BookingPolicyType = query.policy_type === 'experience' ? 'experience' : 'reservation'
  const locationId = typeof query.location_id === 'string' ? query.location_id : null
  const experienceId = typeof query.experience_id === 'string' ? query.experience_id : null
  const locale = typeof query.locale === 'string' ? query.locale : 'en'
  const scopeType: BookingPolicyScopeType = query.scope_type === 'location' || query.scope_type === 'experience' ? query.scope_type : 'site'
  validateBookingPolicyScope({ policyType, scopeType, locationId, experienceId })

  const principal = { env, memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
  if (locationId) {
    const location = await queryFirst<{ id: string }>(db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, siteId])
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  }
  let resourceLocationId = locationId ?? null
  if (experienceId) {
    const experience = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId])
    if (!experience) return jsonResponse({ error: 'experience_id must reference an experience on this site' }, { status: 400 })
    if (!locationId) resourceLocationId = experience.location_id
  }
  await assertResourceAccess(db, { ...principal, resourceLocationId })

  try {
    const direct = await getDirectBookingPolicy(db, { siteId, policyType, scopeType, locationId, experienceId })
    const resolved = await resolveBookingPolicy(db, { siteId, policyType, locationId, experienceId })
    return jsonResponse({
      success: true, policy: direct, resolved_policy: resolved, summary: resolved.id ? renderBookingPolicySummary(resolved, locale) : null, })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to load booking policy' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
