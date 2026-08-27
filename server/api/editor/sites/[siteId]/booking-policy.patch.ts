import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import {
  renderBookingPolicySummary, resolveBookingPolicy, upsertBookingPolicy, validateBookingPolicyPatch, validateBookingPolicyScope, type BookingPolicyScopeType, type BookingPolicyType, } from '~/server/utils/booking-policies'
import { assertResourceAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

  const body = await readBody(event) as Record<string, unknown>
  const policyType = body.policy_type === 'experience' ? 'experience' : 'reservation'
  const locationId = typeof body.location_id === 'string' ? body.location_id : null
  const experienceId = typeof body.experience_id === 'string' ? body.experience_id : null
  const locale = typeof body.locale === 'string' ? body.locale : 'en'
  const scopeType: BookingPolicyScopeType = body.scope_type === 'location' || body.scope_type === 'experience' ? body.scope_type : 'site'
  validateBookingPolicyScope({
    policyType: policyType as BookingPolicyType, scopeType, locationId, experienceId, })

  let experienceLocationId: string | null = null
  if (locationId) {
    const location = await queryFirst<{ id: string }>(
      db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, siteId], )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  }
  if (experienceId) {
    const experience = await queryFirst<{ id: string; location_id: string }>(
      db, `SELECT id, location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId], )
    if (!experience) return jsonResponse({ error: 'experience_id must reference an experience on this site' }, { status: 400 })
    experienceLocationId = experience.location_id
  }

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: locationId ?? experienceLocationId, })

  try {
    const patch = await validateBookingPolicyPatch(body, policyType as BookingPolicyType)
    const policy = await upsertBookingPolicy(db, {
      organizationId: site.organization_id, siteId, policyType: policyType as BookingPolicyType, scopeType, locationId, experienceId, patch, })
    const resolved = await resolveBookingPolicy(db, {
      siteId, policyType: policyType as BookingPolicyType, locationId, experienceId, })
    return jsonResponse({
      success: true, policy, resolved_policy: resolved, summary: renderBookingPolicySummary(resolved, locale), })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to update booking policy' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
