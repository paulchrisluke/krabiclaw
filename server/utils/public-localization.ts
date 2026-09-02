import {
  parseLocalizedResourceType,
  RESOURCE_LOCALIZATION_REGISTRY,
  validateLocalizedValues,
  type LocalizedResourceType,
  type LocalizedValues,
} from '~/server/utils/localization-registry'
import { HTTPError } from 'nitro'
import { queryAll, type DbClient } from '~/server/db'
import { assertSiteLanguageEntitlement } from '~/server/utils/localization'

export interface StoredPublicLocalizationRow {
  resource_type: string
  resource_id: string
  locale: string
  values_json: string
  route_path: string | null
  document_id: string | null
}

export interface ExactPublicLocalization {
  resourceType: LocalizedResourceType
  resourceId: string
  locale: string
  values: LocalizedValues
  routePath: string | null
  documentId: string | null
}

export async function loadExactPublicLocalizations(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locale: string,
): Promise<ExactPublicLocalization[]> {
  const entitlement = await assertSiteLanguageEntitlement(db, organizationId, siteId, locale)
  if (entitlement.source) throw new HTTPError({ statusCode: 404, statusMessage: 'English source routes are unprefixed' })
  const rows = await queryAll<StoredPublicLocalizationRow>(db, `
    SELECT resource_type, resource_id, locale, values_json, route_path, document_id
      FROM resource_localizations
     WHERE organization_id = ? AND site_id = ? AND locale = ?
     ORDER BY resource_type, resource_id
  `, [organizationId, siteId, locale])
  const localizations = indexStoredPublicLocalizations(rows)
  if (!localizations.some(item => item.resourceType === 'site' && item.resourceId === siteId)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Exact localized site representation was not found' })
  }
  return localizations
}

const PROJECTED_FIELD_NAMES: Partial<Record<LocalizedResourceType, Readonly<Record<string, string>>>> = {
  product: {
    tags_json: 'tags',
    details_json: 'details',
  },
  experience: {
    highlights_json: 'highlights',
    included_items_json: 'included_items',
  },
  tenant_blog_post: {
    tags_json: 'tags',
  },
  site_post: {
    body: 'summary',
  },
}

function localizedSlug(routePath: string | null): string | null {
  if (!routePath) return null
  return routePath.split('/').filter(Boolean).at(-1) ?? null
}

function emptyLocalizedValue(sourceValue: unknown, structured = false): unknown {
  if (structured) return []
  if (Array.isArray(sourceValue)) return []
  if (typeof sourceValue === 'string') return ''
  return null
}

export function indexStoredPublicLocalizations(rows: readonly StoredPublicLocalizationRow[]): ExactPublicLocalization[] {
  return rows.map((row) => {
    const resourceType = parseLocalizedResourceType(row.resource_type)
    const parsedValues: unknown = JSON.parse(row.values_json)
    return {
      resourceType,
      resourceId: row.resource_id,
      locale: row.locale,
      values: validateLocalizedValues(resourceType, parsedValues),
      routePath: row.route_path,
      documentId: row.document_id,
    }
  })
}

export function projectExactLocalizedResource<T extends { id: string }>(
  resourceType: LocalizedResourceType,
  canonical: T,
  localization: ExactPublicLocalization,
): T {
  if (localization.resourceType !== resourceType || localization.resourceId !== canonical.id) {
    throw new Error('Localized resource does not match its canonical resource')
  }
  const fieldNames = PROJECTED_FIELD_NAMES[resourceType] ?? {}
  const definition = RESOURCE_LOCALIZATION_REGISTRY[resourceType]
  const clearedValues = Object.fromEntries(
    [...definition.required, ...definition.optional].map((field) => {
      const target = fieldNames[field] ?? field
      return [target, emptyLocalizedValue(
        (canonical as Record<string, unknown>)[target],
        Boolean(definition.shapes?.[field]),
      )]
    }),
  )
  if (resourceType === 'site_post') {
    clearedValues.body = emptyLocalizedValue((canonical as Record<string, unknown>).body)
    clearedValues.summary = emptyLocalizedValue((canonical as Record<string, unknown>).summary)
  }
  const projectedValues = Object.fromEntries(Object.entries(localization.values).map(([field, value]) => [
    fieldNames[field] ?? field,
    value,
  ]))
  if (resourceType === 'site_post' && typeof localization.values.body === 'string') {
    projectedValues.body = localization.values.body
    projectedValues.summary = localization.values.body
  }
  const slug = localizedSlug(localization.routePath)
  return {
    ...canonical,
    ...clearedValues,
    ...projectedValues,
    ...(slug && 'slug' in canonical ? { slug } : {}),
    ...(localization.routePath && 'public_path' in canonical ? { public_path: localization.routePath } : {}),
    ...(localization.routePath && 'canonical_url' in canonical ? { canonical_url: null } : {}),
  }
}

export function projectExactLocalizedCollection<T extends { id: string }>(
  resourceType: LocalizedResourceType,
  canonical: readonly T[],
  localizations: readonly ExactPublicLocalization[],
): T[] {
  const byResourceId = new Map(
    localizations
      .filter(localization => localization.resourceType === resourceType)
      .map(localization => [localization.resourceId, localization]),
  )
  return canonical.flatMap((resource) => {
    const localization = byResourceId.get(resource.id)
    return localization ? [projectExactLocalizedResource(resourceType, resource, localization)] : []
  })
}

export function resolveLocalizedRouteResourceId(
  localizations: readonly ExactPublicLocalization[],
  resourceType: LocalizedResourceType,
  routePath: string,
): string | null {
  return localizations.find(localization =>
    localization.resourceType === resourceType && localization.routePath === routePath,
  )?.resourceId ?? null
}

export function projectLocalizedMediaAlt<T extends { asset_id: string; alt_text: string | null }>(
  media: readonly T[],
  localizations: readonly ExactPublicLocalization[],
): T[] {
  const byResourceId = new Map(
    localizations
      .filter(localization => localization.resourceType === 'media_asset')
      .map(localization => [localization.resourceId, localization]),
  )
  return media.map((asset) => {
    const altText = byResourceId.get(asset.asset_id)?.values.alt_text
    return { ...asset, alt_text: typeof altText === 'string' ? altText : null }
  })
}
