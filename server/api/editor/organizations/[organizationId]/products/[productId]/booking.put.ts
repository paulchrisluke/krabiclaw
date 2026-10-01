import { publicResourceCacheInvalidationQuery, purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'
import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { requireOrganizationProduct } from '~/server/utils/product-management'
import { isValidTimezone } from '~/utils/timezone'
import { executeBatch, queryFirst } from '~/server/db'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Give a product the booking capability, or change its defaults.
 *
 * The existence of this row is what makes the product bookable. Removing it
 * is a separate, destructive operation, because it takes the sessions and
 * their bookings with it.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Organization ID and product ID are required' }, { status: 400 })
  try {
    const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId)
    // Authorizing the site does not authorize the product id in the path.
    await requireOrganizationProduct(db, { organizationId: organization.id, productId })
    const body = await readStrictBody<{ duration_minutes?: unknown; default_capacity?: unknown; confirmation_mode?: unknown; online_payment_required?: unknown; online_timezone?: unknown; calendar_group?: unknown }>(event, { duration_minutes: 'unknown', default_capacity: 'unknown', confirmation_mode: 'unknown', online_payment_required: 'unknown', online_timezone: 'unknown', calendar_group: 'unknown' })
    if (body.confirmation_mode !== undefined && !['instant', 'review'].includes(String(body.confirmation_mode))) return jsonResponse({ error: 'confirmation_mode must be instant or review' }, { status: 400 })
    if (body.online_payment_required !== undefined && typeof body.online_payment_required !== 'boolean') return jsonResponse({ error: 'online_payment_required must be boolean' }, { status: 400 })
    if (body.online_timezone !== undefined && body.online_timezone !== null && (typeof body.online_timezone !== 'string' || !isValidTimezone(body.online_timezone))) return jsonResponse({ error: 'online_timezone must be an IANA timezone or null' }, { status: 400 })
    if (body.calendar_group !== undefined && body.calendar_group !== null && (typeof body.calendar_group !== 'string' || !body.calendar_group.trim() || body.calendar_group.length > 64)) return jsonResponse({ error: 'calendar_group must be a nonempty string of at most 64 characters or null' }, { status: 400 })
    const current = await queryFirst<{ confirmation_mode: string; online_payment_required: number; online_timezone: string | null; calendar_group: string | null }>(db, 'SELECT confirmation_mode, online_payment_required, online_timezone, calendar_group FROM product_booking_configs WHERE organization_id = ? AND product_id = ?', [organization.id, productId])
    const timezone = body.online_timezone === undefined ? current?.online_timezone ?? null : body.online_timezone
    const group = body.calendar_group === undefined ? current?.calendar_group ?? null : body.calendar_group
    if (group && !timezone) return jsonResponse({ error: 'Set an online timezone before enrolling a single calendar' }, { status: 400 })
    for (const field of ['duration_minutes', 'default_capacity'] as const) {
      const value = body[field]
      if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) {
        return jsonResponse({ error: `${field} must be a non-negative integer or null` }, { status: 400 })
      }
    }
    if (body.duration_minutes === 0) return jsonResponse({ error: 'duration_minutes must be positive' }, { status: 400 })
    const now = new Date().toISOString()
    const written = await executeBatch(db, [{
      query: `INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, confirmation_mode, online_payment_required, online_timezone, calendar_group, created_at, updated_at, created_by, updated_by)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE ? IS NULL OR NOT EXISTS (
                SELECT 1 FROM bookings own_booking
                JOIN product_sessions own_session ON own_session.id = own_booking.product_session_id
                JOIN product_sessions other_session ON other_session.organization_id = own_session.organization_id
                  AND other_session.starts_at < own_session.ends_at AND other_session.ends_at > own_session.starts_at
                JOIN bookings other_booking ON other_booking.product_session_id = other_session.id AND other_booking.id <> own_booking.id
                LEFT JOIN product_booking_configs other_config ON other_config.product_id = other_session.product_id
                WHERE own_booking.organization_id = ? AND own_booking.product_id = ?
                  AND own_booking.status IN ('pending', 'confirmed') AND other_booking.status IN ('pending', 'confirmed')
                  AND (other_session.product_id = own_session.product_id OR other_config.calendar_group = ?)
              )
              ON CONFLICT (product_id) DO UPDATE SET duration_minutes = excluded.duration_minutes,
                default_capacity = excluded.default_capacity, confirmation_mode = excluded.confirmation_mode,
                online_payment_required = excluded.online_payment_required, online_timezone = excluded.online_timezone, calendar_group = excluded.calendar_group, updated_at = excluded.updated_at, updated_by = excluded.updated_by
                WHERE product_booking_configs.organization_id = excluded.organization_id`,
      params: [productId, organization.id, body.duration_minutes ?? null, body.default_capacity ?? null, body.confirmation_mode ?? current?.confirmation_mode ?? 'instant', body.online_payment_required === undefined ? current?.online_payment_required ?? 0 : Number(body.online_payment_required), timezone, group, now, now, session.user.id, session.user.id, group, organization.id, productId, group],
    }, publicResourceCacheInvalidationQuery(organization.id, 'booking_config_changed')], { operation: 'Set product booking config' })
    if (!written[0]?.meta?.changes) return jsonResponse({ error: 'Existing appointments overlap this single calendar; resolve them before changing enrollment' }, { status: 409 })
    await purgePublicResourceCacheNow(env, organization.id)
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('booking_config_failed', { organizationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set booking configuration' }, { status: 500 })
  }
})
