import { getConfig } from '~/server/utils/site-config'

export interface SiteLocaleState {
  requestedLocale: string
  sourceLocale: string
  effectiveLocale: string
  isSourceLocale: boolean
  fallbackEnabled: boolean
}

const LOCALE_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i

export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !LOCALE_RE.test(trimmed)) return null
  const parts = trimmed.split('-', 2)
  const language = parts[0]
  const region = parts[1]
  if (!language) return null
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase()
}

export async function getConfiguredSourceLocale(
  db: D1Database,
  organizationId: string,
  siteId: string,
  siteSourceLocale?: string | null,
): Promise<string> {
  const config = await getConfig(db, organizationId, siteId)
  return normalizeLocale(config.source_locale) ?? normalizeLocale(siteSourceLocale) ?? 'en'
}

export async function resolveSiteLocale(
  db: D1Database,
  site: { id: string; organization_id: string; source_locale?: string | null },
  requestedLocale: unknown,
): Promise<SiteLocaleState> {
  const sourceLocale = await getConfiguredSourceLocale(db, site.organization_id, site.id, site.source_locale)
  const requested = normalizeLocale(requestedLocale) ?? sourceLocale

  if (requested === sourceLocale) {
    return {
      requestedLocale: requested,
      sourceLocale,
      effectiveLocale: sourceLocale,
      isSourceLocale: true,
      fallbackEnabled: true,
    }
  }

  const localeRow = await db.prepare(`
    SELECT status, fallback_enabled
    FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
    LIMIT 1
  `).bind(site.organization_id, site.id, requested).first<{
    status: string
    fallback_enabled: number | boolean | null
  }>()

  const isPublished = localeRow?.status === 'published'
  return {
    requestedLocale: requested,
    sourceLocale,
    effectiveLocale: isPublished ? requested : sourceLocale,
    isSourceLocale: !isPublished,
    fallbackEnabled: localeRow ? Boolean(localeRow.fallback_enabled) : true,
  }
}
