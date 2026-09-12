import { HTTPError } from 'nitro'
import { queryAll, type DbClient } from '~/server/db'
import { assertSiteLanguageEntitlement, getPersistedSourceLocale } from '~/server/utils/localization'
import { platformLocale } from '~/shared/platform-locales'
import { RESOURCE_LOCALIZATION_REGISTRY, type LocalizedResourceType } from '~/server/utils/localization-registry'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { postPublicPath } from '~/utils/post-slugs'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

interface RepresentationInput {
  organizationId: string
  siteId: string
  sourcePath: string
  resource?: { type: LocalizedResourceType; id: string; routeSuffix?: string }
  documentId?: string
  publishedLocaleRoute?: boolean
}

export async function resolvePublicLocalizationSourcePath(
  db: DbClient,
  siteId: string,
  resource: { type: LocalizedResourceType; id: string },
): Promise<string> {
  let sourcePath: string | null = null
  if (resource.type === 'business_location') {
    const [row] = await queryAll<{ slug: string }>(db, 'SELECT slug FROM business_locations WHERE site_id = ? AND id = ? LIMIT 1', [siteId, resource.id])
    sourcePath = row ? `/locations/${row.slug}` : null
  }
  // A Product's route is not resolved here: it runs through a location that
  // offers it, and a Product offered at two locations has two routes. The
  // caller passes the one it is rendering.

  if (sourcePath) return sourcePath
  throw new HTTPError({
    statusCode: 500,
    statusMessage: 'Localized resource source route is missing',
    data: { resource_type: resource.type, resource_id: resource.id },
  })
}

export async function resolvePublicDocumentSourcePath(db: DbClient, siteId: string, documentId: string): Promise<string> {
  const [row] = await queryAll<{ id: string; kind: string; path: string | null; slug: string | null; category: string | null; vertical: string; theme_id: string }>(db, `
    SELECT d.id, d.kind, d.path, d.slug, (d.metadata_json ->> '$.category') AS category, s.vertical, s.theme_id
      FROM content_documents d JOIN sites s ON s.id = d.site_id
     WHERE d.site_id = ? AND d.id = ? AND d.row_role = 'root' LIMIT 1`, [siteId, documentId])
  if (row?.kind === 'page' && row.path) return row.path
  if (row?.kind === 'social_post') return postPublicPath(row.slug ?? row.id)
  if (row?.kind === 'article' && row.slug) return tenantBlogPostPath({ themeId: row.theme_id, vertical: row.vertical }, row.slug, row.category)
  throw new HTTPError({ statusCode: 500, statusMessage: 'Document source route is missing', data: { document_id: documentId } })
}

export async function listPublicResourceLocaleRepresentations(
  db: DbClient,
  input: Omit<RepresentationInput, 'sourcePath' | 'resource'> & { resource: { type: LocalizedResourceType; id: string; routeSuffix?: string } },
): Promise<PublicLocaleRepresentation[]> {
  return listPublicLocaleRepresentations(db, {
    ...input,
    sourcePath: await resolvePublicLocalizationSourcePath(db, input.siteId, input.resource),
  })
}

function isUnavailableRepresentation(error: unknown): boolean {
  if (!(error instanceof HTTPError)) return false
  const code = error.data && typeof error.data === 'object' && 'code' in error.data
    ? error.data.code
    : null
  return code === 'LANGUAGE_ENTITLEMENT_REQUIRED'
    || code === 'PLATFORM_LOCALE_UNAVAILABLE'
}

export async function listPublicLocaleRepresentations(
  db: DbClient,
  input: RepresentationInput,
): Promise<PublicLocaleRepresentation[]> {
  const sourceLocale = await getPersistedSourceLocale(db, input.organizationId, input.siteId)
  const sourceCatalog = platformLocale(sourceLocale.locale)
  if (!sourceCatalog) throw new HTTPError({ statusCode: 500, statusMessage: 'Site primary language catalog is unavailable' })
  const representations: PublicLocaleRepresentation[] = [{
    locale: sourceLocale.locale,
    label: sourceCatalog.label,
    route_path: input.sourcePath,
    source: 'source',
  }]
  // A resource whose localized route is derived has no stored path: the route
  // is the locale prefix on the source path the caller is rendering.
  const derivesRoute = input.resource ? RESOURCE_LOCALIZATION_REGISTRY[input.resource.type].route === 'derived' : false
  const candidates = input.resource
    ? await queryAll<{ locale: string; route_path: string }>(db, `
        SELECT rl.locale, ${derivesRoute ? "'/' || rl.locale || ?" : 'rl.route_path'} AS route_path
          FROM resource_localizations rl
          JOIN site_locales sl
            ON sl.organization_id = rl.organization_id AND sl.site_id = rl.site_id AND sl.locale = rl.locale
         WHERE rl.organization_id = ? AND rl.site_id = ?
           AND rl.resource_type = ? AND rl.resource_id = ?${derivesRoute ? '' : ' AND rl.route_path IS NOT NULL'}
           AND sl.status = 'published'
         ORDER BY rl.locale
      `, [...(derivesRoute ? [input.sourcePath] : []), input.organizationId, input.siteId, input.resource.type, input.resource.id])
    : input.documentId
      ? await queryAll<{ locale: string; route_path: string }>(db, `
          SELECT v.locale,
                 CASE WHEN v.path = '/' THEN '/' || v.locale ELSE '/' || v.locale || v.path END AS route_path
            FROM content_documents v
            JOIN site_locales sl
              ON sl.organization_id = v.organization_id AND sl.site_id = v.site_id AND sl.locale = v.locale
           WHERE v.organization_id = ? AND v.site_id = ? AND v.root_id = ? AND v.row_role = 'representation' AND v.locale <> 'en'
             AND sl.status = 'published'
           ORDER BY v.locale
        `, [input.organizationId, input.siteId, input.documentId])
      : input.publishedLocaleRoute
        ? await queryAll<{ locale: string; route_path: string }>(db, `
            SELECT sl.locale,
                   CASE WHEN ? = '/' THEN '/' || sl.locale ELSE '/' || sl.locale || ? END AS route_path
              FROM site_locales sl
             WHERE sl.organization_id = ? AND sl.site_id = ? AND sl.locale <> ?
               AND sl.status = 'published'
             ORDER BY sl.locale
          `, [input.sourcePath, input.sourcePath, input.organizationId, input.siteId, sourceLocale.locale])
        : []

  for (const candidate of candidates) {
    try {
      await assertSiteLanguageEntitlement(db, input.organizationId, input.siteId, candidate.locale)
    } catch (error) {
      if (isUnavailableRepresentation(error)) continue
      throw error
    }
    const catalog = platformLocale(candidate.locale)
    if (!catalog) throw new HTTPError({ statusCode: 500, statusMessage: 'Published language catalog is unavailable' })
    representations.push({
      locale: candidate.locale,
      label: catalog.label,
      route_path: `${candidate.route_path}${input.resource?.routeSuffix ?? ''}`,
      source: 'localized',
    })
  }
  return representations
}
