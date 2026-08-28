import type { DbClient } from '~/server/db'
import { getPersistedSourceLocale, listSiteLocaleRecords } from '~/server/utils/localization'

export type SiteLocaleStatus = 'published' | 'disabled'

export async function getSourceLocale(db: DbClient, organizationId: string, siteId: string): Promise<'en'> {
  const source = await getPersistedSourceLocale(db, organizationId, siteId)
  return source.locale as 'en'
}
export async function listSiteLocales(db: DbClient, organizationId: string, siteId: string) {
  return { locales: await listSiteLocaleRecords(db, organizationId, siteId) }
}
