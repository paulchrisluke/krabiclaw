import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { updateLocation, type UpdateLocationInput } from '~/server/utils/location-management'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { requireLocationAccess } from '~/server/utils/location-access'
import { parseLocationPayload } from '~/server/utils/location-payload'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locationId = getRouterParam(event, 'locationId')
  if (!organizationId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const body = await readRequiredBody<Record<string, unknown>>(event)
  const { env, db, session, organization } = await requireLocationAccess(event, organizationId, locationId)

  const rating = body.rating === undefined || body.rating === null || String(body.rating).trim() === ''
    ? undefined
    : Number(body.rating)
  const reviewCount = body.review_count === undefined || body.review_count === null || String(body.review_count).trim() === ''
    ? undefined
    : Number(body.review_count)

  // A malformed address is the caller's mistake, not a server fault, so it
  // answers 400 rather than letting the parser's TypeError become a 500.
  let address: PostalAddress | null | undefined
  try {
    address = body.address === undefined ? undefined : parsePostalAddress(body.address)
  } catch (cause) {
    return jsonResponse({ error: cause instanceof Error ? cause.message : 'address is invalid' }, { status: 400 })
  }

  const result = await updateLocation(
    db, organization.id, organizationId, locationId, {
      title: typeof body.title === 'string' ? body.title : undefined, slug: typeof body.slug === 'string' ? body.slug : undefined, address, phone: typeof body.phone === 'string' ? body.phone : undefined, email: typeof body.email === 'string' ? body.email : undefined, website_url: typeof body.website_url === 'string' ? body.website_url : body.website_url === null ? null : undefined, maps_url: typeof body.maps_url === 'string' ? body.maps_url : body.maps_url === null ? null : undefined, opening_hours: body.opening_hours === undefined ? undefined : (body.opening_hours || null) as UpdateLocationInput['opening_hours'], description: typeof body.description === 'string' ? body.description : body.description === null ? null : undefined, short_description: typeof body.short_description === 'string' ? body.short_description : body.short_description === null ? null : undefined, price_level: typeof body.price_level === 'string' ? body.price_level : body.price_level === null ? null : undefined, facebook_url: typeof body.facebook_url === 'string' ? body.facebook_url : body.facebook_url === null ? null : undefined, instagram_url: typeof body.instagram_url === 'string' ? body.instagram_url : body.instagram_url === null ? null : undefined, tiktok_url: typeof body.tiktok_url === 'string' ? body.tiktok_url : body.tiktok_url === null ? null : undefined, google_place_id: typeof body.google_place_id === 'string' ? body.google_place_id : body.google_place_id === null ? null : undefined, rating, review_count: reviewCount, status: body.status === 'active' || body.status === 'inactive' || body.status === 'sync_error'
        ? body.status
        : undefined, }, session.user.id, env, )

  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }
  await purgePublicResourceCacheSafe(env, organizationId)

  const location = (result.data as { location?: unknown }).location
  return jsonResponse({
    success: true, location: location ? parseLocationPayload(location) : null, }, { status: result.status })
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
import { parsePostalAddress, type PostalAddress } from '~/utils/postal-address'
