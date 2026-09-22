import type { DbClient } from '~/server/db'
import { getPersistedSourceLocale, listSiteLocaleRecords } from '~/server/utils/localization'

export type SiteLocaleStatus = 'published' | 'disabled'

export async function getSourceLocale(db: DbClient, organizationId: string): Promise<'en'> {
  const source = await getPersistedSourceLocale(db, organizationId, organizationId)
  return source.locale as 'en'
}
export async function listSiteLocales(db: DbClient, organizationId: string) {
  return { locales: await listSiteLocaleRecords(db, organizationId, organizationId) }
}
