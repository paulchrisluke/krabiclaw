import { getConfiguredSourceLocale, normalizeLocale } from '~/server/utils/site-i18n'

export type SiteLocaleStatus = 'draft' | 'published' | 'disabled'

export interface SiteLocale {
  id: string
  organization_id: string
  site_id: string
  locale: string
  label: string | null
  is_source: boolean
  status: SiteLocaleStatus
  fallback_enabled: boolean
  created_at: string
  updated_at: string
}

interface SiteLocaleRow extends Omit<SiteLocale, 'is_source' | 'fallback_enabled'> {
  is_source: number | boolean
  fallback_enabled: number | boolean
}

export interface SiteLocaleInput {
  locale: string
  label?: string | null
  status?: SiteLocaleStatus
  fallback_enabled?: boolean
  is_source?: boolean
}

function mapLocale(row: SiteLocaleRow): SiteLocale {
  return {
    ...row,
    is_source: Boolean(row.is_source),
    fallback_enabled: Boolean(row.fallback_enabled),
  }
}

function assertStatus(value: unknown): SiteLocaleStatus {
  if (value === undefined || value === null || value === '') return 'draft'
  if (value === 'draft' || value === 'published' || value === 'disabled') return value
  throw new Error('Invalid locale status.')
}

export async function getSourceLocale(db: D1Database, organizationId: string, siteId: string): Promise<string> {
  return getConfiguredSourceLocale(db, organizationId, siteId)
}

export async function listSiteLocales(
  db: D1Database,
  organizationId: string,
  siteId: string,
): Promise<{ source_locale: string; locales: SiteLocale[] }> {
  const sourceLocale = await getSourceLocale(db, organizationId, siteId)
  const { results } = await db.prepare(`
    SELECT id, organization_id, site_id, locale, label, is_source, status, fallback_enabled, created_at, updated_at
    FROM site_locales
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_source DESC, locale ASC
  `).bind(organizationId, siteId).all<SiteLocaleRow>()

  const locales = (results ?? []).map(mapLocale)
  if (!locales.some(locale => locale.locale === sourceLocale)) {
    locales.unshift({
      id: `locale::${organizationId}::${siteId}::${sourceLocale}`,
      organization_id: organizationId,
      site_id: siteId,
      locale: sourceLocale,
      label: null,
      is_source: true,
      status: 'published',
      fallback_enabled: true,
      created_at: '1970-01-01T00:00:00Z',
      updated_at: '1970-01-01T00:00:00Z',
    })
  }

  return { source_locale: sourceLocale, locales }
}

export async function upsertSiteLocale(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: SiteLocaleInput,
): Promise<SiteLocale> {
  const locale = normalizeLocale(input.locale)
  if (!locale) throw new Error('Invalid locale.')

  const status = input.is_source ? 'published' : assertStatus(input.status)
  const fallbackEnabled = input.fallback_enabled ?? true
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : null
  const now = new Date().toISOString()
  const id = `locale::${organizationId}::${siteId}::${locale}`

  const batch = []

  if (input.is_source) {
    batch.push(
      db.prepare(`
        INSERT INTO site_config (organization_id, site_id, key, value)
        VALUES (?, ?, 'source_locale', ?)
        ON CONFLICT(organization_id, site_id, key) DO UPDATE SET value = excluded.value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).bind(organizationId, siteId, locale)
    )
    batch.push(
      db.prepare(`
        UPDATE site_locales
        SET is_source = 0, updated_at = ?
        WHERE organization_id = ? AND site_id = ? AND locale != ?
      `).bind(now, organizationId, siteId, locale)
    )
  }

  batch.push(
    db.prepare(`
      INSERT INTO site_locales
        (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET
        label = excluded.label,
        is_source = excluded.is_source,
        status = excluded.status,
        fallback_enabled = excluded.fallback_enabled,
        updated_at = excluded.updated_at
    `).bind(
      id,
      organizationId,
      siteId,
      locale,
      label,
      input.is_source ? 1 : 0,
      status,
      fallbackEnabled ? 1 : 0,
      now,
      now,
    )
  )

  await db.batch(batch)

  const row = await db.prepare(`
    SELECT id, organization_id, site_id, locale, label, is_source, status, fallback_enabled, created_at, updated_at
    FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
    LIMIT 1
  `).bind(organizationId, siteId, locale).first<SiteLocaleRow>()

  if (!row) throw new Error('Locale was not saved.')
  return mapLocale(row)
}

export async function deleteSiteLocale(
  db: D1Database,
  organizationId: string,
  siteId: string,
  localeInput: string,
): Promise<{ deleted: true; source_locale: string }> {
  const locale = normalizeLocale(localeInput)
  if (!locale) throw new Error('Invalid locale.')

  const sourceLocale = await getSourceLocale(db, organizationId, siteId)
  if (locale === sourceLocale) {
    throw new Error('Cannot delete the source language.')
  }

  await db.prepare(`
    DELETE FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
  `).bind(organizationId, siteId, locale).run()

  return { deleted: true, source_locale: sourceLocale }
}
