// PATCH /api/dashboard/locations/[id] — Update a location

import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardLocationContext } from '~/server/utils/dashboard-context'
import { resolveLocationCapabilitySummary, updateLocation, type UpdateLocationInput } from '~/server/utils/location-management'
import { parseLocationPayload } from '~/server/utils/location-payload'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { assertMemberScope } from '~/server/utils/member-access'
import { parsePhone } from '~/utils/phone'
import type { ProductFeature } from '~/config/cms-registry'

export default defineHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const { env, db, session, organization, location: locationContext } = await getDashboardLocationContext(event, locationId)
  const organizationId = organization.id
  const siteId = locationContext.site_id
  await assertMemberScope(db, {
    memberId: organization.memberId, role: organization.role, organizationId, siteId, locationId, })

  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body !== 'object' || body === null) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  let normalizedNotificationPhone: string | null | undefined
  if (typeof body.notification_phone === 'string' && body.notification_phone.trim()) {
    const parsed = parsePhone(body.notification_phone, { defaultCountry: 'TH' })
    if (!parsed.valid || !parsed.e164) {
      return jsonResponse({ error: 'Enter a valid notification phone number, including country code' }, { status: 400 })
    }
    normalizedNotificationPhone = parsed.e164
  } else if (body.notification_phone === null) {
    normalizedNotificationPhone = null
  }

  const rating = body.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? undefined
    : (() => { const n = Number(body.rating); return Number.isFinite(n) ? n : undefined })()
  const reviewCount = body.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? undefined
    : (() => { const n = Number(body.review_count); return Number.isFinite(n) ? n : undefined })()

  // Unlike the other optional fields above, a malformed feature_overrides (wrong type, not
  // object/null) must not silently collapse to `undefined` — that would look like "field not
  // touched" to updateLocation and quietly no-op a request the caller expected to apply.
  let featureOverrides: { enabled?: string[]; disabled?: string[] } | null | undefined
  if (body.feature_overrides === undefined) {
    featureOverrides = undefined
  } else if (body.feature_overrides === null) {
    featureOverrides = null
  } else if (typeof body.feature_overrides === 'object' && !Array.isArray(body.feature_overrides)) {
    const raw = body.feature_overrides as { enabled?: unknown; disabled?: unknown }
    const validEnabled = raw.enabled === undefined || (Array.isArray(raw.enabled) && raw.enabled.every((v) => typeof v === 'string'))
    const validDisabled = raw.disabled === undefined || (Array.isArray(raw.disabled) && raw.disabled.every((v) => typeof v === 'string'))
    if (!validEnabled || !validDisabled) {
      return jsonResponse({ error: 'feature_overrides.enabled/disabled must be arrays of feature ids' }, { status: 400 })
    }
    featureOverrides = { enabled: raw.enabled as string[] | undefined, disabled: raw.disabled as string[] | undefined }
  } else {
    return jsonResponse({ error: 'feature_overrides must be an object with enabled/disabled arrays, or null' }, { status: 400 })
  }

  const result = await updateLocation(
    db, organizationId, siteId, locationId, {
      title: typeof body.title === 'string' ? body.title : undefined, slug: typeof body.slug === 'string' ? body.slug : undefined, address: body.address === undefined
        ? undefined
        : body.address === null
          ? null
          : typeof body.address === 'string'
            ? body.address
            : JSON.stringify(body.address), city: typeof body.city === 'string' ? body.city : body.city === null ? null : undefined, neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood : body.neighborhood === null ? null : undefined, phone: typeof body.phone === 'string' ? body.phone : body.phone === null ? null : undefined, email: typeof body.email === 'string' ? body.email : body.email === null ? null : undefined, website_url: typeof body.website_url === 'string' ? body.website_url : body.website_url === null ? null : undefined, maps_url: typeof body.maps_url === 'string' ? body.maps_url : body.maps_url === null ? null : undefined, google_review_url: typeof body.google_review_url === 'string' ? body.google_review_url : body.google_review_url === null ? null : undefined, opening_hours: body.opening_hours === undefined
        ? undefined
        : body.opening_hours === null
          ? null
          : body.opening_hours as UpdateLocationInput['opening_hours'], description: typeof body.description === 'string' ? body.description : body.description === null ? null : undefined, short_description: typeof body.short_description === 'string' ? body.short_description : body.short_description === null ? null : undefined, price_level: typeof body.price_level === 'string' ? body.price_level : body.price_level === null ? null : undefined, facebook_url: typeof body.facebook_url === 'string' ? body.facebook_url : body.facebook_url === null ? null : undefined, instagram_url: typeof body.instagram_url === 'string' ? body.instagram_url : body.instagram_url === null ? null : undefined, tiktok_url: typeof body.tiktok_url === 'string' ? body.tiktok_url : body.tiktok_url === null ? null : undefined, grab_url: typeof body.grab_url === 'string' ? body.grab_url : body.grab_url === null ? null : undefined, uber_eats_url: typeof body.uber_eats_url === 'string' ? body.uber_eats_url : body.uber_eats_url === null ? null : undefined, foodpanda_url: typeof body.foodpanda_url === 'string' ? body.foodpanda_url : body.foodpanda_url === null ? null : undefined, google_place_id: typeof body.google_place_id === 'string' ? body.google_place_id : body.google_place_id === null ? null : undefined, notification_phone: normalizedNotificationPhone, timezone: typeof body.timezone === 'string' ? body.timezone.trim() || null : body.timezone === null ? null : undefined, rating, review_count: reviewCount, is_primary: typeof body.is_primary === 'boolean' ? body.is_primary : undefined, status: body.status === 'active' || body.status === 'inactive' || body.status === 'sync_error'
        ? body.status
        : undefined, feature_overrides: featureOverrides as { enabled?: ProductFeature[]; disabled?: ProductFeature[] } | null | undefined, }, session.user.id, )

  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }

  await purgePublicResourceCacheSafe(env, siteId)

  const location = (result.data as { location?: { feature_overrides?: string | null } }).location
  const capabilitySummary = location ? await resolveLocationCapabilitySummary(db, organizationId, siteId, location.feature_overrides ?? null) : null
  return jsonResponse({
    success: true, location: location ? parseLocationPayload(location) : null, ...capabilitySummary, }, { status: result.status })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
