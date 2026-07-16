// PATCH /api/dashboard/locations/[id] — Update a location
import { getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { syncLocationWhatsAppAccess, updateLocation } from '~/server/utils/location-management'
import { parseLocationPayload } from './location-helpers'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { queryFirst } from '~/server/db'
import { assertMemberScope } from '~/server/utils/member-access'
import { parsePhone } from '~/utils/phone'

export default defineEventHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  // Don't require the x-dashboard-site-slug header here: a location is fully
  // self-scoping once we know the org (the id is already in the URL), and some
  // callers — like the post-transfer onboarding wizard at the org-scoped
  // /~/onboarding route — have no siteSlug route param to attach it from, and
  // may legitimately belong to an org with multiple sites at the time of the call.
  const dashboard = await getDashboardContext(event, { requireSite: false })
  const { organization } = dashboard
  if (!organization?.id) {
    return jsonResponse({ error: 'Organization not found' }, { status: 400 })
  }
  const organizationId = organization.id as string

  const locationSite = await queryFirst<{ site_id: string }>(db, `
    SELECT site_id FROM business_locations WHERE id = ? AND organization_id = ? LIMIT 1
  `, [locationId, organizationId])
  if (!locationSite) {
    return jsonResponse({ error: 'Location not found' }, { status: 404 })
  }
  const siteId = locationSite.site_id
  await assertMemberScope(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId,
    siteId,
    locationId,
  })

  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body !== 'object' || body === null) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  // Normalize to canonical E.164 at this write boundary (issue #293 Section D)
  // — `ensureWhatsAppRecipientAccess`/`isAuthorizedWhatsAppRecipient` already
  // compare against E.164, but the raw trimmed input was previously stored
  // as-is in `business_locations.notification_phone`, which silently broke
  // that comparison for any input that wasn't already E.164-shaped.
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

  const previousLocation = await queryFirst<{ notification_phone: string | null }>(db, `
    SELECT notification_phone FROM business_locations WHERE id = ? LIMIT 1
  `, [locationId])
  const previousNotificationPhone = previousLocation?.notification_phone ?? null

  const rating = body.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? undefined
    : (() => { const n = Number(body.rating); return Number.isFinite(n) ? n : undefined })()
  const reviewCount = body.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? undefined
    : (() => { const n = Number(body.review_count); return Number.isFinite(n) ? n : undefined })()

  const result = await updateLocation(
    db,
    organizationId,
    siteId,
    locationId,
    {
      title: typeof body.title === 'string' ? body.title : undefined,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      address: body.address === undefined
        ? undefined
        : body.address === null
          ? null
          : typeof body.address === 'string'
            ? body.address
            : JSON.stringify(body.address),
      city: typeof body.city === 'string' ? body.city : body.city === null ? null : undefined,
      neighborhood: typeof body.neighborhood === 'string' ? body.neighborhood : body.neighborhood === null ? null : undefined,
      phone: typeof body.phone === 'string' ? body.phone : body.phone === null ? null : undefined,
      email: typeof body.email === 'string' ? body.email : body.email === null ? null : undefined,
      hero_image_asset_id: typeof body.hero_image_asset_id === 'string' ? body.hero_image_asset_id : body.hero_image_asset_id === null ? null : undefined,
      hero_video_asset_id: typeof body.hero_video_asset_id === 'string' ? body.hero_video_asset_id : body.hero_video_asset_id === null ? null : undefined,
      website_url: typeof body.website_url === 'string' ? body.website_url : body.website_url === null ? null : undefined,
      maps_url: typeof body.maps_url === 'string' ? body.maps_url : body.maps_url === null ? null : undefined,
      google_review_url: typeof body.google_review_url === 'string' ? body.google_review_url : body.google_review_url === null ? null : undefined,
      opening_hours: body.opening_hours === undefined
        ? undefined
        : body.opening_hours === null
          ? null
          : typeof body.opening_hours === 'string'
            ? body.opening_hours
            : JSON.stringify(body.opening_hours),
      description: typeof body.description === 'string' ? body.description : body.description === null ? null : undefined,
      short_description: typeof body.short_description === 'string' ? body.short_description : body.short_description === null ? null : undefined,
      price_level: typeof body.price_level === 'string' ? body.price_level : body.price_level === null ? null : undefined,
      facebook_url: typeof body.facebook_url === 'string' ? body.facebook_url : body.facebook_url === null ? null : undefined,
      instagram_url: typeof body.instagram_url === 'string' ? body.instagram_url : body.instagram_url === null ? null : undefined,
      tiktok_url: typeof body.tiktok_url === 'string' ? body.tiktok_url : body.tiktok_url === null ? null : undefined,
      grab_url: typeof body.grab_url === 'string' ? body.grab_url : body.grab_url === null ? null : undefined,
      uber_eats_url: typeof body.uber_eats_url === 'string' ? body.uber_eats_url : body.uber_eats_url === null ? null : undefined,
      foodpanda_url: typeof body.foodpanda_url === 'string' ? body.foodpanda_url : body.foodpanda_url === null ? null : undefined,
      google_place_id: typeof body.google_place_id === 'string' ? body.google_place_id : body.google_place_id === null ? null : undefined,
      notification_phone: normalizedNotificationPhone,
      timezone: typeof body.timezone === 'string' ? body.timezone.trim() || null : body.timezone === null ? null : undefined,
      rating,
      review_count: reviewCount,
      is_primary: typeof body.is_primary === 'boolean' ? body.is_primary : undefined,
      status: body.status === 'active' || body.status === 'inactive' || body.status === 'sync_error'
        ? body.status
        : undefined,
    },
    session.user.id,
  )

  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }

  // Provisioning/scope-recalculation for a notification_phone change only
  // runs AFTER the location write above has committed (CodeRabbit follow-up
  // on issue #293 Section G/I): provisioning the new number before the save
  // could leave access/invitations for a phone value that never actually
  // got persisted, and running scope cleanup for the old number before the
  // save could revoke a manager's access for a change that then failed to
  // save. This also only runs when the field was actually touched (idempotency
  // — Section I) — a save that doesn't touch notification_phone, or resubmits
  // the same number, must not remove or re-audit anything (the no-op case is
  // also handled inside syncLocationWhatsAppAccess itself).
  let whatsappSyncWarning: string | undefined
  let whatsappSyncError: string | undefined
  if (normalizedNotificationPhone !== undefined) {
    const sync = await syncLocationWhatsAppAccess(env as unknown as Parameters<typeof syncLocationWhatsAppAccess>[0], db, {
      organizationId,
      siteId,
      locationId,
      previousPhone: previousNotificationPhone,
      newPhone: normalizedNotificationPhone,
      inviterUserId: session.user.id,
      actorHeaders: getHeaders(event) as HeadersInit,
    })
    if (!sync.ok) {
      // The location save above already committed — do not hide this behind
      // a clean 200. A provisioning failure means the new manager may not
      // have gotten access; a scope-recalc failure means a previous manager
      // may still be authorized under the number that was just replaced.
      // Record the error for retry/recovery rather than only logging it.
      whatsappSyncError = sync.scopeRecalcError
        ? 'Location saved, but a previous manager\'s WhatsApp access could not be fully revoked. Please retry or check access manually.'
        : 'Location saved, but WhatsApp access could not be provisioned for the new number. Please retry.'
      whatsappSyncWarning = whatsappSyncError
    }
  }

  await purgeBootstrapCacheSafe(env, siteId)

  const location = (result.data as { location?: unknown }).location
  return jsonResponse({
    success: true,
    location: location ? parseLocationPayload(location) : null,
    ...(whatsappSyncWarning ? { warning: whatsappSyncWarning } : {}),
  }, { status: whatsappSyncWarning ? 207 : result.status })
})
