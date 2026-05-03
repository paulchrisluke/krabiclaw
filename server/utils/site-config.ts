import type { D1Database } from '@cloudflare/workers-types'

export interface SiteConfig {
  ga4_property_id?: string
  search_console_site_url?: string
  gbp_location_id?: string
  gbp_account_id?: string
}

export const getConfig = async (db: D1Database): Promise<SiteConfig> => {
  const { results } = await db.prepare(
    `SELECT key, value FROM site_config` 
  ).all<{ key: string; value: string }>()
  return Object.fromEntries((results ?? []).map(r => [r.key, r.value]))
}

export const setConfig = async (db: D1Database, key: keyof SiteConfig, value: string) => {
  await db.prepare(
    `INSERT INTO site_config (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(key, value).run()
}

export const deleteConfig = async (db: D1Database, key: keyof SiteConfig) => {
  await db.prepare(`DELETE FROM site_config WHERE key = ?`).bind(key).run()
}
