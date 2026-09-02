import { HTTPError } from 'nitro'
import { queryAll, type DbClient } from '~/server/db'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'
import type { LocalizedResourceType } from '~/server/utils/localization-registry'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

interface RepresentationInput {
  organizationId: string
  siteId: string
  sourcePath: string
  sourceLabel: string
  resource?: { type: LocalizedResourceType; id: string; routeSuffix?: string }
  pageId?: string
}

function isUnavailableRepresentation(error: unknown): boolean {
  if (!(error instanceof HTTPError)) return false
  const code = error.data && typeof error.data === 'object' && 'code' in error.data
    ? error.data.code
    : null
  return code === 'LANGUAGE_LICENSE_REQUIRED'
    || code === 'LANGUAGE_LICENSE_SYNCING'
    || code === 'PLATFORM_LOCALE_UNAVAILABLE'
}

export async function listPublicLocaleRepresentations(
  db: DbClient,
  input: RepresentationInput,
): Promise<PublicLocaleRepresentation[]> {
  const representations: PublicLocaleRepresentation[] = [{
    locale: 'en',
    label: input.sourceLabel,
    route_path: input.sourcePath,
    source: 'source',
  }]
  const candidates = input.resource
    ? await queryAll<{ locale: string; label: string; route_path: string }>(db, `
        SELECT rl.locale, COALESCE(sl.label, rl.locale) AS label, rl.route_path
          FROM resource_localizations rl
          JOIN site_locales sl
            ON sl.organization_id = rl.organization_id AND sl.site_id = rl.site_id AND sl.locale = rl.locale
         WHERE rl.organization_id = ? AND rl.site_id = ?
           AND rl.resource_type = ? AND rl.resource_id = ? AND rl.route_path IS NOT NULL
           AND sl.status = 'published'
           AND EXISTS (
             SELECT 1 FROM resource_localizations site_rl
              WHERE site_rl.organization_id = rl.organization_id AND site_rl.site_id = rl.site_id
                AND site_rl.locale = rl.locale AND site_rl.resource_type = 'site' AND site_rl.resource_id = rl.site_id
           )
         ORDER BY rl.locale
      `, [input.organizationId, input.siteId, input.resource.type, input.resource.id])
    : input.pageId
      ? await queryAll<{ locale: string; label: string; route_path: string }>(db, `
          SELECT v.locale, COALESCE(sl.label, v.locale) AS label,
                 CASE WHEN v.path = '/' THEN '/' || v.locale ELSE '/' || v.locale || v.path END AS route_path
            FROM tenant_page_variants v
            JOIN site_locales sl
              ON sl.organization_id = v.organization_id AND sl.site_id = v.site_id AND sl.locale = v.locale
           WHERE v.organization_id = ? AND v.site_id = ? AND v.page_id = ? AND v.locale <> 'en'
             AND sl.status = 'published'
             AND EXISTS (
               SELECT 1 FROM resource_localizations site_rl
                WHERE site_rl.organization_id = v.organization_id AND site_rl.site_id = v.site_id
                  AND site_rl.locale = v.locale AND site_rl.resource_type = 'site' AND site_rl.resource_id = v.site_id
             )
           ORDER BY v.locale
        `, [input.organizationId, input.siteId, input.pageId])
      : []

  for (const candidate of candidates) {
    try {
      await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, candidate.locale)
    } catch (error) {
      if (isUnavailableRepresentation(error)) continue
      throw error
    }
    representations.push({
      locale: candidate.locale,
      label: candidate.label,
      route_path: `${candidate.route_path}${input.resource?.routeSuffix ?? ''}`,
      source: 'localized',
    })
  }
  return representations
}
