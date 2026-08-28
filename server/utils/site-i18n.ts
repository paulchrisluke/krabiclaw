import type { DbClient } from '~/server/db'
import {
  assertExactCanonicalLocale,
  assertSiteLanguageEntitlement,
  canonicalizeLocale,
  getPersistedSourceLocale,
} from '~/server/utils/localization'

export interface SiteLocaleState {
  requestedLocale: string
  sourceLocale: 'en'
  effectiveLocale: string
  isSourceLocale: boolean
  platformMessages: Record<string, string> | null
}
export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return canonicalizeLocale(value)
  } catch {
    return null
  }
}

export async function getConfiguredSourceLocale(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<'en'> {
  const source = await getPersistedSourceLocale(db, organizationId, siteId)
  return source.locale as 'en'
}

export async function resolveSiteLocale(
  db: DbClient,
  site: { id: string; organization_id: string },
  requestedLocale: unknown,
): Promise<SiteLocaleState> {
  const sourceLocale = await getConfiguredSourceLocale(db, site.organization_id, site.id)
  const requested = requestedLocale === undefined || requestedLocale === null || requestedLocale === ''
    ? sourceLocale
    : assertExactCanonicalLocale(requestedLocale)
  const entitlement = await assertSiteLanguageEntitlement(db, site.organization_id, site.id, requested)
  return {
    requestedLocale: requested,
    sourceLocale,
    effectiveLocale: requested,
    isSourceLocale: entitlement.source,
    platformMessages: entitlement.platform_messages,
  }
}
