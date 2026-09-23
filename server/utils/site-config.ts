import { assertCalendarDate, localNow, MINUTE_TIME_PATTERN, isValidTimezone } from '~/utils/timezone'
import { HTTPError } from 'nitro'
import { execute, queryFirst, type DbClient } from '~/server/db'
import { isSiteFontPreset, resolveSiteFontPreset, type SiteFontPreset } from '~/shared/site-fonts'

export interface SiteConfig {
  brand_color?: string
  font_preset?: SiteFontPreset
  social_facebook?: string
  social_instagram?: string
  social_tiktok?: string
  press_email?: string
  partnerships_email?: string
  catering_email?: string
  careers_email?: string
  google_analytics_measurement_id?: string
  google_site_verification?: string
  default_timezone?: string
}

export const getConfig = async (
  db: DbClient,
  organizationId: string,
): Promise<SiteConfig> => {
  const row = await queryFirst<Record<keyof SiteConfig | 'font_preset_type', unknown>>(db, `
    SELECT json_extract(settings_json, '$.config.brand_color') AS brand_color,
           json_extract(settings_json, '$.config.font_preset') AS font_preset,
           json_type(settings_json, '$.config.font_preset') AS font_preset_type,
           json_extract(settings_json, '$.config.press_email') AS press_email,
           json_extract(settings_json, '$.config.partnerships_email') AS partnerships_email,
           json_extract(settings_json, '$.config.catering_email') AS catering_email,
           json_extract(settings_json, '$.config.careers_email') AS careers_email,
           CASE WHEN json_extract(integrations_json, '$.google_analytics.status') = 'active' THEN json_extract(integrations_json, '$.google_analytics.measurement_id') END AS google_analytics_measurement_id,
           json_extract(settings_json, '$.config.google_site_verification') AS google_site_verification,
           json_extract(settings_json, '$.config.default_timezone') AS default_timezone,
           social_facebook_url AS social_facebook,
           social_instagram_url AS social_instagram,
           social_tiktok_url AS social_tiktok
      FROM organization WHERE id = ?
  `, [organizationId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  const config: SiteConfig = {}
  for (const key of ["brand_color","press_email","partnerships_email","catering_email","careers_email","google_analytics_measurement_id","google_site_verification","default_timezone","social_facebook","social_instagram","social_tiktok"] as const) {
    const value = row[key]
    if (value == null) continue
    if (typeof value !== 'string') throw new Error('Invalid stored site setting: ' + key)
    config[key] = value
  }
  // A missing optional setting preserves the template. An explicit null or an
  // unsupported stored value is not a valid preset.
  config.font_preset = resolveSiteFontPreset(row.font_preset_type === null ? undefined : row.font_preset)
  return config
}

export const resolveLocationTimezone = async (
  db: DbClient,
  organizationId: string,
  locationId: string | null,
): Promise<string> => {
  const location = await queryFirst<{ timezone: string | null }>(db,
    'SELECT timezone FROM business_locations WHERE id = ? AND organization_id = ?',
    [locationId, organizationId])
  if (!location?.timezone) throw new HTTPError({ statusCode: 409, statusMessage: 'Set the location timezone before offering bookings' })
  return location.timezone
}

/**
 * Returns true if `dateStr` (YYYY-MM-DD) is strictly before "today" as observed in `timezone`.
 * Workers always run on a UTC clock, so the "today" check must use the venue's zone.
 */
export const isDateBeforeTimezoneToday = (date: string, timezone: string): boolean => {
  assertCalendarDate(date)
  return date < localNow(timezone).date
}
export const isTimeSlotInPast = (date: string, time: string, timezone: string, now = new Date()): boolean => {
  assertCalendarDate(date)
  if (!MINUTE_TIME_PATTERN.test(time)) throw new Error('Invalid booking time')
  const current = localNow(timezone, now)
  return date === current.date ? time <= current.time : date < current.date
}

export const setConfig = async (
  db: DbClient,
  organizationId: string,
  key: keyof SiteConfig,
  value: string
) => {
  if (key === 'font_preset' && !isSiteFontPreset(value)) throw new HTTPError({ statusCode: 422, statusMessage: 'Unsupported site font preset' })
  if (key === 'default_timezone' && !isValidTimezone(value)) throw new HTTPError({ statusCode: 422, statusMessage: 'A valid analytics timezone is required' })
  if (key === 'social_facebook' || key === 'social_instagram' || key === 'social_tiktok') {
    const result = await execute(db, `UPDATE organization SET ${key}_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [value || null, organizationId])
    if (result.meta?.changes !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'Organization not found. Reload before saving.' })
    return
  }
  if (key === 'google_analytics_measurement_id') {
    // The credential and the product that uses it are separate keys now, so
    // "connected through OAuth" is the presence of google_credential rather
    // than a `kind` discriminator on one merged object.
    const current = await queryFirst<{ connected: number; measurement_id: string | null; revision: string | null }>(db, `
      SELECT json_type(integrations_json, '$.google_credential') IS NOT NULL AS connected,
             json_extract(integrations_json, '$.google_analytics.measurement_id') AS measurement_id,
             json_extract(integrations_json, '$.google_analytics.revision') AS revision
        FROM organization WHERE id = ?
    `, [organizationId])
    if (!current) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
    if (current.connected) {
      if ((current.measurement_id ?? '') === value) return
      throw new HTTPError({ statusCode: 409, statusMessage: 'Disconnect Google Analytics before setting a manual measurement ID' })
    }
    // A key with no measurement id describes nothing, and the CHECK requires
    // one, so clearing the id removes the key rather than nulling the field.
    const result = value
      ? await execute(db, `
        UPDATE organization SET integrations_json = json_set(integrations_json, '$.google_analytics',
          json_object('revision', ?, 'status', 'active', 'measurement_id', ?,
            'created_at', COALESCE(json_extract(integrations_json, '$.google_analytics.created_at'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            'updated_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
        WHERE id = ? AND json_extract(integrations_json, '$.google_analytics.revision') IS ?
      `, [crypto.randomUUID(), value, organizationId, current.revision])
      : await execute(db, `
        UPDATE organization SET integrations_json = json_remove(integrations_json, '$.google_analytics')
        WHERE id = ? AND json_extract(integrations_json, '$.google_analytics.revision') IS ?
      `, [organizationId, current.revision])
    if (result.meta?.changes !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'Google Analytics settings changed. Reload before saving.' })
    return
  }
  const result = await execute(
    db,
    `UPDATE organization SET settings_json = json_set(settings_json, ?, ?),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    ['$.config.' + key, value, organizationId],
  )
  if (result.meta?.changes !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'Site ownership changed. Reload before saving.' })
}

export const deleteConfig = async (
  db: DbClient,
  organizationId: string,
  key: keyof SiteConfig
) => {
  if (key === 'default_timezone') throw new HTTPError({ statusCode: 422, statusMessage: 'The analytics timezone cannot be removed' })
  if (key === 'google_analytics_measurement_id' || key === 'social_facebook' || key === 'social_instagram' || key === 'social_tiktok') return setConfig(db, organizationId, key, '')
  const result = await execute(
    db,
    `UPDATE organization SET settings_json = json_remove(settings_json, ?),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    ['$.config.' + key, organizationId],
  )
  if (result.meta?.changes !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'Site ownership changed. Reload before saving.' })
}
