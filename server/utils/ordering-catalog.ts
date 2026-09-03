import { HTTPError } from 'nitro'
import { queryAll, type BatchQuery, type DbClient } from '~/server/db'
import type { Product } from '~/server/types/products'
import type {
  CatalogLineItemSnapshot,
  CatalogProviderMapping,
  CatalogProviderResourceType,
  MenuPlacement,
  ModifierGroup,
  ModifierGroupInput,
  ProductChannelAvailability,
} from '~/shared/ordering-catalog'
import { isProductAvailableForOrdering } from '~/shared/ordering-catalog'
import { requireTrimmedProductString } from '~/server/utils/product-validation'

const MODIFIER_NAME_LIMIT = 120
const MAX_MODIFIER_GROUPS = 20
const MAX_MODIFIER_OPTIONS = 50

interface PlacementRow {
  id: string
  location_id: string
  product_id: string
  section: string
  sort_order: number
  is_published: number
  featured: number
  featured_sort_order: number
}

interface AvailabilityRow {
  id: string
  location_id: string
  product_id: string
  channel: ProductChannelAvailability['channel']
  is_available: number
}

interface ModifierRow {
  product_id: string
  group_id: string
  group_name: string
  minimum_selections: number
  maximum_selections: number
  group_sort_order: number
  group_is_active: number
  option_id: string | null
  option_name: string | null
  price_delta_minor: number | null
  option_sort_order: number | null
  option_is_active: number | null
}

interface ProviderMappingRow extends CatalogProviderMapping {
  product_id: string
}

function mapPlacement(row: PlacementRow): MenuPlacement {
  return {
    id: row.id,
    location_id: row.location_id,
    product_id: row.product_id,
    section: row.section,
    sort_order: Number(row.sort_order),
    is_published: Number(row.is_published) === 1,
    featured: Number(row.featured) === 1,
    featured_sort_order: Number(row.featured_sort_order),
  }
}

function mapAvailability(row: AvailabilityRow): ProductChannelAvailability {
  return {
    id: row.id,
    location_id: row.location_id,
    product_id: row.product_id,
    channel: row.channel,
    is_available: Number(row.is_available) === 1,
  }
}

function mappingKey(resourceType: CatalogProviderResourceType, resourceId: string): string {
  return `${resourceType}:${resourceId}`
}

export async function hydrateOrderingCatalog(
  db: DbClient,
  products: Product[],
): Promise<Product[]> {
  if (products.length === 0) return products
  const productIds = products.map(product => product.id)
  const productIdJson = JSON.stringify(productIds)
  const [placements, availability, modifierRows, mappingRows] = await Promise.all([
    queryAll<PlacementRow>(db, `
      SELECT id, location_id, product_id, section, sort_order, is_published, featured, featured_sort_order
        FROM product_menu_placements
       WHERE product_id IN (SELECT value FROM json_each(?))
       ORDER BY location_id, sort_order, id
    `, [productIdJson]),
    queryAll<AvailabilityRow>(db, `
      SELECT id, location_id, product_id, channel, is_available
        FROM product_channel_availability
       WHERE product_id IN (SELECT value FROM json_each(?))
       ORDER BY product_id, channel
    `, [productIdJson]),
    queryAll<ModifierRow>(db, `
      SELECT pmg.product_id, mg.id AS group_id, mg.name AS group_name,
             mg.minimum_selections, mg.maximum_selections, pmg.sort_order AS group_sort_order,
             mg.is_active AS group_is_active, mo.id AS option_id, mo.name AS option_name,
             mo.price_delta_minor, mo.sort_order AS option_sort_order, mo.is_active AS option_is_active
        FROM product_modifier_groups pmg
        JOIN modifier_groups mg ON mg.id = pmg.modifier_group_id
         AND mg.organization_id = pmg.organization_id AND mg.site_id = pmg.site_id AND mg.location_id = pmg.location_id
        LEFT JOIN modifier_options mo ON mo.modifier_group_id = mg.id
         AND mo.organization_id = mg.organization_id AND mo.site_id = mg.site_id AND mo.location_id = mg.location_id
       WHERE pmg.product_id IN (SELECT value FROM json_each(?))
       ORDER BY pmg.product_id, pmg.sort_order, mg.id, mo.sort_order, mo.id
    `, [productIdJson]),
    queryAll<ProviderMappingRow>(db, `
      SELECT p.id AS product_id, cpm.id, cpm.resource_type, cpm.resource_id, cpm.provider,
             cpm.provider_account_reference, cpm.external_id
        FROM catalog_provider_mappings cpm
        JOIN products p ON p.organization_id = cpm.organization_id
         AND p.site_id = cpm.site_id AND p.location_id = cpm.location_id
       WHERE p.id IN (SELECT value FROM json_each(?))
         AND (
           (cpm.resource_type = 'product' AND cpm.resource_id = p.id)
           OR (cpm.resource_type = 'price' AND cpm.resource_id IN (SELECT id FROM prices WHERE product_id = p.id))
           OR (cpm.resource_type = 'modifier_group' AND cpm.resource_id IN (SELECT modifier_group_id FROM product_modifier_groups WHERE product_id = p.id))
           OR (cpm.resource_type = 'modifier_option' AND cpm.resource_id IN (
             SELECT mo.id FROM modifier_options mo
             JOIN product_modifier_groups links ON links.modifier_group_id = mo.modifier_group_id
             WHERE links.product_id = p.id
           ))
         )
       ORDER BY cpm.resource_type, cpm.resource_id, cpm.provider, cpm.external_id
    `, [productIdJson]),
  ])

  const placementByProduct = new Map(placements.map(row => [row.product_id, mapPlacement(row)]))
  const availabilityByProduct = new Map<string, ProductChannelAvailability[]>()
  for (const row of availability) {
    const values = availabilityByProduct.get(row.product_id) ?? []
    values.push(mapAvailability(row))
    availabilityByProduct.set(row.product_id, values)
  }

  const mappingsByProduct = new Map<string, Map<string, CatalogProviderMapping[]>>()
  for (const row of mappingRows) {
    const byResource = mappingsByProduct.get(row.product_id) ?? new Map<string, CatalogProviderMapping[]>()
    const key = mappingKey(row.resource_type, row.resource_id)
    const values = byResource.get(key) ?? []
    values.push({
      id: row.id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      provider: row.provider,
      provider_account_reference: row.provider_account_reference,
      external_id: row.external_id,
    })
    byResource.set(key, values)
    mappingsByProduct.set(row.product_id, byResource)
  }

  const groupsByProduct = new Map<string, ModifierGroup[]>()
  for (const row of modifierRows) {
    const groups = groupsByProduct.get(row.product_id) ?? []
    let group = groups.find(candidate => candidate.id === row.group_id)
    const mappings = mappingsByProduct.get(row.product_id)
    if (!group) {
      group = {
        id: row.group_id,
        name: row.group_name,
        minimum_selections: Number(row.minimum_selections),
        maximum_selections: Number(row.maximum_selections),
        sort_order: Number(row.group_sort_order),
        is_active: Number(row.group_is_active) === 1,
        options: [],
        provider_mappings: mappings?.get(mappingKey('modifier_group', row.group_id)) ?? [],
      }
      groups.push(group)
      groupsByProduct.set(row.product_id, groups)
    }
    if (row.option_id && row.option_name !== null) {
      group.options.push({
        id: row.option_id,
        modifier_group_id: row.group_id,
        name: row.option_name,
        price_delta_minor: Number(row.price_delta_minor ?? 0),
        sort_order: Number(row.option_sort_order ?? 0),
        is_active: Number(row.option_is_active) === 1,
        provider_mappings: mappings?.get(mappingKey('modifier_option', row.option_id)) ?? [],
      })
    }
  }

  return products.map((product) => {
    const mappings = mappingsByProduct.get(product.id)
    return {
      ...product,
      menu_placement: placementByProduct.get(product.id) ?? null,
      channel_availability: availabilityByProduct.get(product.id) ?? [],
      modifier_groups: groupsByProduct.get(product.id) ?? [],
      provider_mappings: mappings?.get(mappingKey('product', product.id)) ?? [],
      price: product.price
        ? { ...product.price, provider_mappings: mappings?.get(mappingKey('price', product.price.id)) ?? [] }
        : null,
    }
  })
}

function nonNegativeInteger(value: unknown, field: string, fallback: number): number {
  const resolved = value === undefined ? fallback : value
  if (typeof resolved !== 'number' || !Number.isSafeInteger(resolved) || resolved < 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a non-negative integer` })
  }
  return resolved
}

export function replaceProductModifierQueries(input: {
  organizationId: string
  siteId: string
  locationId: string
  productId: string
  modifierGroups: ModifierGroupInput[]
  actor: string
  now: string
}): BatchQuery[] {
  if (!Array.isArray(input.modifierGroups) || input.modifierGroups.length > MAX_MODIFIER_GROUPS) {
    throw new HTTPError({ statusCode: 400, statusMessage: `modifier_groups may contain at most ${MAX_MODIFIER_GROUPS} groups` })
  }
  const queries: BatchQuery[] = [
    { query: `DELETE FROM modifier_groups WHERE id IN (SELECT modifier_group_id FROM product_modifier_groups WHERE product_id = ?)`, params: [input.productId] },
  ]
  for (const [groupIndex, group] of input.modifierGroups.entries()) {
    if (!Array.isArray(group.options) || group.options.length > MAX_MODIFIER_OPTIONS) {
      throw new HTTPError({ statusCode: 400, statusMessage: `modifier_groups[${groupIndex}].options may contain at most ${MAX_MODIFIER_OPTIONS} options` })
    }
    const minimum = nonNegativeInteger(group.minimum_selections, `modifier_groups[${groupIndex}].minimum_selections`, 0)
    const maximum = nonNegativeInteger(group.maximum_selections, `modifier_groups[${groupIndex}].maximum_selections`, 1)
    if (maximum < 1 || minimum > maximum) {
      throw new HTTPError({ statusCode: 400, statusMessage: `modifier_groups[${groupIndex}] has an invalid selection range` })
    }
    const groupId = group.id ?? crypto.randomUUID()
    queries.push({
      query: `INSERT INTO modifier_groups (id, organization_id, site_id, location_id, name, minimum_selections, maximum_selections, sort_order, is_active, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [groupId, input.organizationId, input.siteId, input.locationId, requireTrimmedProductString(group.name, `modifier_groups[${groupIndex}].name`, MODIFIER_NAME_LIMIT), minimum, maximum, groupIndex, group.is_active !== false, input.now, input.now, input.actor, input.actor],
    })
    queries.push({
      query: `INSERT INTO product_modifier_groups (id, organization_id, site_id, location_id, product_id, modifier_group_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), input.organizationId, input.siteId, input.locationId, input.productId, groupId, groupIndex],
    })
    for (const [optionIndex, option] of group.options.entries()) {
      queries.push({
        query: `INSERT INTO modifier_options (id, organization_id, site_id, location_id, modifier_group_id, name, price_delta_minor, sort_order, is_active, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [option.id ?? crypto.randomUUID(), input.organizationId, input.siteId, input.locationId, groupId, requireTrimmedProductString(option.name, `modifier_groups[${groupIndex}].options[${optionIndex}].name`, MODIFIER_NAME_LIMIT), nonNegativeInteger(option.price_delta_minor, `modifier_groups[${groupIndex}].options[${optionIndex}].price_delta_minor`, 0), optionIndex, option.is_active !== false, input.now, input.now, input.actor, input.actor],
      })
    }
  }
  return queries
}

export function buildCatalogLineItemSnapshot(product: Product, selectedOptionIds: readonly string[], quantity = 1): CatalogLineItemSnapshot {
  if (!product.price) throw new HTTPError({ statusCode: 409, statusMessage: 'Product has no active Price' })
  if (!product.menu_placement?.is_published) throw new HTTPError({ statusCode: 409, statusMessage: 'Product is not published on the menu' })
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new HTTPError({ statusCode: 400, statusMessage: 'Quantity must be a positive integer' })
  if (!isProductAvailableForOrdering(product, quantity)) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Product does not have sufficient current inventory' })
  }
  if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Modifier option IDs must be unique' })
  }
  const selected = new Set(selectedOptionIds)
  const modifiers: CatalogLineItemSnapshot['modifiers'] = []
  for (const group of product.modifier_groups.filter(candidate => candidate.is_active)) {
    const options = group.options.filter(option => option.is_active && selected.has(option.id))
    if (options.length < group.minimum_selections || options.length > group.maximum_selections) {
      throw new HTTPError({ statusCode: 409, statusMessage: `Select between ${group.minimum_selections} and ${group.maximum_selections} options for ${group.name}` })
    }
    for (const option of options) {
      modifiers.push({
        modifier_group_id: group.id,
        modifier_group_name: group.name,
        modifier_option_id: option.id,
        modifier_option_name: option.name,
        price_delta_minor: option.price_delta_minor,
        provider_mappings: option.provider_mappings,
      })
    }
  }
  const knownIds = new Set(product.modifier_groups.flatMap(group => group.options.map(option => option.id)))
  if (selectedOptionIds.some(id => !knownIds.has(id))) throw new HTTPError({ statusCode: 400, statusMessage: 'Unknown modifier option' })
  return {
    product_id: product.id,
    price_id: product.price.id,
    product_name: product.name,
    unit_amount_minor: product.price.amount_minor,
    currency: product.price.currency,
    unit: product.price.unit,
    tax_behavior: product.price.tax_behavior,
    modifiers,
    product_provider_mappings: product.provider_mappings,
    price_provider_mappings: product.price.provider_mappings,
  }
}
