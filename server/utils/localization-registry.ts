import { localizationError } from './localization-errors.ts'
import { queryAll, type DbClient } from '../db/index.ts'
import {
  isMetafieldLocalizable,
  metafieldHandle,
  validateMetafieldValue,
  MetafieldError,
  type MetafieldDefinition,
} from '../../shared/metafields.ts'

import { LOCALIZED_RESOURCE_TYPES, type LocalizedResourceType } from '../../shared/content-registries.ts'
export { LOCALIZED_RESOURCE_TYPES, type LocalizedResourceType } from '../../shared/content-registries.ts'

export type LocalizedValues = Record<string, unknown>

/**
 * `metafields` is not a fixed field list. Its keys are the tenant's own
 * metafield definitions, and each definition declares its own type and
 * whether it may be translated at all. That declaration is the ONLY source:
 * this registry deliberately keeps no list of attribute names, so adding an
 * eleventh product attribute needs no edit here.
 */
type ValueShape = 'text' | 'string_array' | 'metafields' | { readonly [field: string]: ValueShape }

/**
 * How a localized resource is addressed publicly.
 *
 * - `stored`: the resource has exactly one public route, and the localized
 *   path is stored on its localization row.
 * - `derived`: the resource reaches the public through a location that offers
 *   it, so its localized path is the locale prefix on that location-scoped
 *   route. A Product offered at two locations has two localized routes, and no
 *   single stored path could name both.
 * - `none`: the resource has no route of its own.
 */
type LocalizedRouteAddressing = 'none' | 'stored' | 'derived'

interface ResourceLocalizationDefinition {
  table: string
  fields: Readonly<Record<string, ValueShape>>
  route: LocalizedRouteAddressing
}

const POLICY_FIELDS = { additional_notes_html: 'text' } as const

export const RESOURCE_LOCALIZATION_REGISTRY: Readonly<Record<LocalizedResourceType, ResourceLocalizationDefinition>> = Object.freeze({
  site: { table: 'sites', fields: { brand_name: 'text', brand_description: 'text', seo_title: 'text', seo_description: 'text',
    compliance: { service_area: 'text', disclaimer: 'text', footer_disclaimer: 'text' }, consultation: { cta_label: 'text' } }, route: 'none' },
  business_location: { table: 'business_locations', fields: { title: 'text', address: 'text', city: 'text',
    neighborhood: 'text', description: 'text', short_description: 'text', seo_title: 'text', seo_description: 'text',
    reservation: { policy: POLICY_FIELDS } }, route: 'stored' },
  // Product SEO is owned by the canonical content document, so it is not
  // localized here: a second SEO source would be a second thing to keep true.
  product: { table: 'products', fields: { name: 'text', description: 'text', tags: 'string_array',
    marketing_features: 'string_array', unit_label: 'text', metafields: 'metafields' }, route: 'derived' },
  collection: { table: 'collections', fields: { name: 'text', description: 'text' }, route: 'none' },
  media_asset: { table: 'media_assets', fields: { alt_text: 'text' }, route: 'none' },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonBlankText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** The tenant's metafield definitions, keyed by '<namespace>.<key>'. */
export type MetafieldDefinitionIndex = ReadonlyMap<string, MetafieldDefinition>

function validateMetafields(field: string, value: unknown, definitions: MetafieldDefinitionIndex | undefined): void {
  if (!isRecord(value)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be an object`, { field })
  if (!definitions) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'metafield definitions are required to validate localized attributes', { field })
  }
  for (const [handle, entry] of Object.entries(value)) {
    const definition = definitions.get(handle)
    if (!definition) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field}.${handle} has no definition`, { field: `${field}.${handle}` })
    // Eligibility is the definition's own declaration. A number or a boolean
    // has nothing to translate and is refused here rather than stored as a
    // string that drifts from the source value.
    if (!isMetafieldLocalizable(definition)) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field}.${handle} is not translatable`, { field: `${field}.${handle}` })
    }
    try { validateMetafieldValue(definition, entry) }
    catch (error) {
      if (!(error instanceof MetafieldError)) throw error
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field}.${handle}: ${error.message}`, { field: `${field}.${handle}` })
    }
  }
}

function validateShape(field: string, value: unknown, shape: ValueShape, definitions?: MetafieldDefinitionIndex): void {
  if (shape === 'text' && typeof value === 'string') return
  if (typeof shape === 'object' && isRecord(value)) {
    if (Object.keys(value).some(key => !Object.hasOwn(shape, key))) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} contains unknown localized fields`, { field })
    for (const [key, nested] of Object.entries(value)) validateShape(`${field}.${key}`, nested, shape[key]!, definitions)
    return
  }
  if (shape === 'metafields') { validateMetafields(field, value, definitions); return }
  if (shape === 'string_array') {
    if (Array.isArray(value) && value.every(isNonBlankText)) return
  }
  localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} has an invalid localized value shape`, { field })
}

export function parseLocalizedResourceType(value: unknown): LocalizedResourceType {
  if (typeof value === 'string' && (LOCALIZED_RESOURCE_TYPES as readonly string[]).includes(value)) {
    return value as LocalizedResourceType
  }
  localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'Unsupported localized resource type', { resource_type: value })
}

export function validateLocalizedValues(
  resourceType: LocalizedResourceType,
  input: unknown,
  definitions?: MetafieldDefinitionIndex,
): LocalizedValues {
  if (!isRecord(input)) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'values must be an object')
  const definition = RESOURCE_LOCALIZATION_REGISTRY[resourceType]
  const unknown = Object.keys(input).filter(key => !Object.hasOwn(definition.fields, key)).sort()
  if (unknown.length) {
    localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `Unknown localized field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`, { fields: unknown })
  }
  for (const [field, shape] of Object.entries(definition.fields)) {
    if (!Object.hasOwn(input, field)) continue
    const value = input[field]
    if (value === undefined || value === null) {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be omitted instead of null`, { field })
    }
    if (shape === 'text' && typeof value !== 'string') {
      localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', `${field} must be a string`, { field })
    }
    validateShape(field, value, shape, definitions)
  }
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
}

const SEGMENT = '[^/?#]+'

export function validateLocalizedRoutePath(resourceType: LocalizedResourceType, locale: string, routePath: unknown): string | null {
  const definition = RESOURCE_LOCALIZATION_REGISTRY[resourceType]
  if (definition.route !== 'stored') {
    if (routePath !== undefined && routePath !== null) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', resourceType + ' does not accept route_path')
    return null
  }
  if (typeof routePath !== 'string' || !routePath.trim()) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'route_path is required for ' + resourceType)
  const path = routePath.trim()
  const prefix = '/' + locale + '/'
  const suffix = 'locations/' + SEGMENT
  if (!path.startsWith(prefix) || !new RegExp('^' + suffix + '$').test(path.slice(prefix.length)) || path.includes('//')) localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'route_path is invalid for ' + resourceType, { route_path: path })
  return path
}

/**
 * Load the tenant's metafield definitions for the localization validator.
 *
 * Kept here beside the registry so there is one place that answers "which
 * product attributes are translatable", and it answers by reading the
 * definitions rather than by holding a list.
 */
export async function loadMetafieldDefinitionIndex(db: DbClient, organizationId: string): Promise<MetafieldDefinitionIndex> {
  const rows = await queryAll<Record<string, unknown>>(db, 'SELECT * FROM metafield_definitions WHERE organization_id = ?', [organizationId])
  return new Map(rows.map((row) => {
    const definition: MetafieldDefinition = {
      id: String(row.id), organization_id: String(row.organization_id), namespace: String(row.namespace),
      key: String(row.key), name: String(row.name), description: row.description === null ? null : String(row.description),
      value_type: String(row.value_type) as MetafieldDefinition['value_type'],
      validations: JSON.parse(String(row.validations)) as MetafieldDefinition['validations'],
      localizable: Number(row.localizable) === 1,
    }
    return [metafieldHandle(definition), definition]
  }))
}
