import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { getConfiguredSourceLocale, normalizeLocale } from '~/server/utils/site-i18n'

export type SiteLocaleStatus = 'published' | 'disabled'

export interface SiteLocale {
  id: string
  organization_id: string
  site_id: string
  locale: string
  label: string | null
  is_source: boolean
  status: SiteLocaleStatus
  created_at: string
  updated_at: string
}

interface SiteLocaleRow extends Omit<SiteLocale, 'is_source'> {
  is_source: number | boolean
}

export interface SiteLocaleInput {
  locale: string
  label?: string | null
  status?: SiteLocaleStatus
  is_source?: boolean
}

function mapLocale(row: SiteLocaleRow): SiteLocale {
  return {
    ...row,
    is_source: Boolean(row.is_source),
  }
}

function assertStatus(value: unknown): SiteLocaleStatus {
  if (value === undefined || value === null || value === '') return 'disabled'
  if (value === 'published' || value === 'disabled') return value
  throw new Error('Invalid locale status.')
}

export async function getSourceLocale(db: DbClient, organizationId: string, siteId: string): Promise<string> {
  return getConfiguredSourceLocale(db, organizationId, siteId)
}

export async function listSiteLocales(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<{ source_locale: string; locales: SiteLocale[] }> {
  const sourceLocale = await getSourceLocale(db, organizationId, siteId)
  const results = await queryAll<SiteLocaleRow>(db, `
    SELECT id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at
    FROM site_locales
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_source DESC, locale ASC
  `, [organizationId, siteId])

  const locales = results.map(mapLocale)
  if (!locales.some(locale => locale.locale === sourceLocale)) {
    locales.unshift({
      id: `locale::${organizationId}::${siteId}::${sourceLocale}`,
      organization_id: organizationId,
      site_id: siteId,
      locale: sourceLocale,
      label: null,
      is_source: true,
      status: 'published',
      created_at: '1970-01-01T00:00:00Z',
      updated_at: '1970-01-01T00:00:00Z',
    })
  }

  return { source_locale: sourceLocale, locales }
}

export async function upsertSiteLocale(
  db: DbClient,
  organizationId: string,
  siteId: string,
  input: SiteLocaleInput,
): Promise<SiteLocale> {
  const locale = normalizeLocale(input.locale)
  if (!locale) throw new Error('Invalid locale.')

  const sourceLocale = await getSourceLocale(db, organizationId, siteId)
  const isSource = input.is_source === true || locale === sourceLocale
  const status = isSource ? 'published' : assertStatus(input.status)
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : null
  const now = new Date().toISOString()
  const id = `locale::${organizationId}::${siteId}::${locale}`

  const batch: BatchQuery[] = []

  if (input.is_source) {
    batch.push({
      query: `
        INSERT INTO site_config (organization_id, site_id, key, value)
        VALUES (?, ?, 'source_locale', ?)
        ON CONFLICT(organization_id, site_id, key) DO UPDATE SET value = excluded.value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `,
      params: [organizationId, siteId, locale],
    })
    batch.push({
      query: `
        UPDATE site_locales
        SET is_source = 0, updated_at = ?
        WHERE organization_id = ? AND site_id = ? AND locale != ?
      `,
      params: [now, organizationId, siteId, locale],
    })
  }

  batch.push({
    query: `
      INSERT INTO site_locales
        (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET
        label = excluded.label,
        is_source = excluded.is_source,
        status = excluded.status,
        updated_at = excluded.updated_at
    `,
    params: [
      id,
      organizationId,
      siteId,
      locale,
      label,
      isSource ? 1 : 0,
      status,
      now,
      now,
    ],
  })

  await executeBatch(db, batch)

  const row = await queryFirst<SiteLocaleRow>(db, `
    SELECT id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at
    FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
    LIMIT 1
  `, [organizationId, siteId, locale])

  if (!row) throw new Error('Locale was not saved.')
  return mapLocale(row)
}

export async function deleteSiteLocale(
  db: DbClient,
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

  await execute(db, `
    DELETE FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
  `, [organizationId, siteId, locale])

  return { deleted: true, source_locale: sourceLocale }
}
