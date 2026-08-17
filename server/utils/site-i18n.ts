import { HTTPError } from 'nitro';
import { queryFirst, type DbClient } from '~/server/db'
import { getConfig } from '~/server/utils/site-config'

export interface SiteLocaleState {
  requestedLocale: string
  sourceLocale: string
  effectiveLocale: string
  isSourceLocale: boolean
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
  db: DbClient,
  organizationId: string,
  siteId: string,
  siteSourceLocale?: string | null,
): Promise<string> {
  const config = await getConfig(db, organizationId, siteId)
  return normalizeLocale(config.source_locale) ?? normalizeLocale(siteSourceLocale) ?? 'en'
}

export async function resolveSiteLocale(
  db: DbClient,
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
    }
  }

  const localeRow = await queryFirst<{ status: string }>(db, `
    SELECT status
    FROM site_locales
    WHERE organization_id = ? AND site_id = ? AND locale = ?
    LIMIT 1
  `, [site.organization_id, site.id, requested])

  if (localeRow?.status !== 'published') {
    throw new HTTPError({
      statusCode: 404,
      statusMessage: `Locale ${requested} is not published for this site`,
    })
  }

  return {
    requestedLocale: requested,
    sourceLocale,
    effectiveLocale: requested,
    isSourceLocale: false,
  }
}
