import type { D1Database } from '@cloudflare/workers-types'

export interface SiteConfig {
  ga4_property_id?: string
  search_console_site_url?: string
  gbp_location_id?: string
  gbp_account_id?: string
  brand_color?: string
  social_facebook?: string
  social_instagram?: string
  social_tiktok?: string
  footer_tagline?: string
  press_email?: string
  partnerships_email?: string
  catering_email?: string
  careers_email?: string
  source_locale?: string
  google_analytics_measurement_id?: string
  google_site_verification?: string
  hero_image_url?: string
  location_hero_image_url?: string
}

export const getConfig = async (
  db: D1Database,
  organizationId: string,
  siteId: string
): Promise<SiteConfig> => {
  const { results } = await db.prepare(
    `SELECT key, value FROM site_config
     WHERE organization_id = ? AND site_id = ?`
  ).bind(organizationId, siteId).all<{ key: string; value: string }>()
  return Object.fromEntries((results ?? []).map(r => [r.key, r.value]))
}

export const setConfig = async (
  db: D1Database,
  organizationId: string,
  siteId: string,
  key: keyof SiteConfig,
  value: string
) => {
  await db.prepare(
    `INSERT INTO site_config (organization_id, site_id, key, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(organization_id, site_id, key) DO UPDATE SET value = excluded.value,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(organizationId, siteId, key, value).run()
}

export const deleteConfig = async (
  db: D1Database,
  organizationId: string,
  siteId: string,
  key: keyof SiteConfig
) => {
  await db.prepare(
    `DELETE FROM site_config
     WHERE organization_id = ? AND site_id = ? AND key = ?`
  ).bind(organizationId, siteId, key).run()
}
