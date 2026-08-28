import { HTTPError } from 'nitro'
import type { ProductDetail } from '~/server/types/products'

export const PRODUCT_LIMITS = {
  category: 120,
  name: 240,
  description: 10_000,
  tags: 32,
  tag: 120,
  detailGroups: 24,
  detailKey: 80,
  detailLabel: 120,
  detailValues: 32,
  detailValue: 500,
  detailPayload: 20_000,
  orderUrl: 2_048,
  seoTitle: 240,
  seoDescription: 1_000,
  canonicalUrl: 2_048,
  robots: 240,
} as const

const PRODUCT_DETAIL_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const PRODUCT_ROBOTS_DIRECTIVES = new Set([
  'index,follow',
  'noindex,follow',
  'index,nofollow',
  'noindex,nofollow',
])

function invalid(message: string): never {
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

export function requireTrimmedProductString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') invalid(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) invalid(`${field} is required`)
  if (normalized.length > maxLength) invalid(`${field} must be at most ${maxLength} characters`)
  return normalized
}

export function normalizeOptionalProductString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') invalid(`${field} must be a string or null`)
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) invalid(`${field} must be at most ${maxLength} characters`)
  return normalized
}

export function normalizeRequiredProductPrice(value: unknown, field = 'price_amount'): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    invalid(`${field} must be a non-negative decimal amount`)
  }
  const raw = String(value).trim()
  if (!DECIMAL_AMOUNT.test(raw)) invalid(`${field} must be a non-negative decimal amount`)
  const [whole, fraction] = raw.split('.')
  const normalizedFraction = fraction?.replace(/0+$/, '') ?? ''
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole!
}

export function normalizeOptionalProductPrice(value: unknown, field = 'compare_at_price_amount'): string | null {
  if (value === null || value === undefined || value === '') return null
  return normalizeRequiredProductPrice(value, field)
}

function normalizeDateOnly(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) invalid(`${field} must use YYYY-MM-DD`)
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    invalid(`${field} must be a valid calendar date`)
  }
  return value
}

export function validateProductSale(input: {
  price_amount: unknown
  compare_at_price_amount?: unknown
  sale_starts_at?: unknown
  sale_ends_at?: unknown
}) {
  const priceAmount = normalizeRequiredProductPrice(input.price_amount)
  const compareAtPriceAmount = normalizeOptionalProductPrice(input.compare_at_price_amount)
  const saleStartsAt = normalizeDateOnly(input.sale_starts_at, 'sale_starts_at')
  const saleEndsAt = normalizeDateOnly(input.sale_ends_at, 'sale_ends_at')
  if (compareAtPriceAmount !== null && Number(compareAtPriceAmount) <= Number(priceAmount)) {
    invalid('compare_at_price_amount must be greater than price_amount')
  }
  if ((saleStartsAt || saleEndsAt) && compareAtPriceAmount === null) {
    invalid('sale dates require compare_at_price_amount')
  }
  if (saleStartsAt && saleEndsAt && saleEndsAt < saleStartsAt) {
    invalid('sale_ends_at cannot precede sale_starts_at')
  }
  return { priceAmount, compareAtPriceAmount, saleStartsAt, saleEndsAt }
}

export function validateProductTags(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalid('tags must be an array')
  if (value.length > PRODUCT_LIMITS.tags) invalid(`tags may contain at most ${PRODUCT_LIMITS.tags} values`)
  const seen = new Set<string>()
  return value.map((entry, index) => {
    const normalized = requireTrimmedProductString(entry, `tags[${index}]`, PRODUCT_LIMITS.tag)
    const identity = normalized.toLocaleLowerCase('en-US')
    if (seen.has(identity)) invalid('tags must be unique ignoring case')
    seen.add(identity)
    return normalized
  })
}

export function validateProductDetails(value: unknown): ProductDetail[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalid('details must be an array')
  if (value.length > PRODUCT_LIMITS.detailGroups) invalid(`details may contain at most ${PRODUCT_LIMITS.detailGroups} groups`)
  const keys = new Set<string>()
  const details = value.map((entry, groupIndex) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid(`details[${groupIndex}] must be an object`)
    const record = entry as Record<string, unknown>
    const unknown = Object.keys(record).filter(key => !['key', 'label', 'values'].includes(key))
    if (unknown.length) invalid(`details[${groupIndex}] contains unsupported fields: ${unknown.join(', ')}`)
    const key = requireTrimmedProductString(record.key, `details[${groupIndex}].key`, PRODUCT_LIMITS.detailKey)
    if (!PRODUCT_DETAIL_KEY.test(key)) invalid(`details[${groupIndex}].key must be lowercase kebab-case`)
    if (keys.has(key)) invalid('detail keys must be unique')
    keys.add(key)
    const label = requireTrimmedProductString(record.label, `details[${groupIndex}].label`, PRODUCT_LIMITS.detailLabel)
    if (!Array.isArray(record.values) || record.values.length < 1 || record.values.length > PRODUCT_LIMITS.detailValues) {
      invalid(`details[${groupIndex}].values must contain 1-${PRODUCT_LIMITS.detailValues} values`)
    }
    const valuesSeen = new Set<string>()
    const values = record.values.map((item, valueIndex) => {
      const normalized = requireTrimmedProductString(item, `details[${groupIndex}].values[${valueIndex}]`, PRODUCT_LIMITS.detailValue)
      const identity = normalized.toLocaleLowerCase('en-US')
      if (valuesSeen.has(identity)) invalid(`details[${groupIndex}].values must be unique ignoring case`)
      valuesSeen.add(identity)
      return normalized
    })
    return { key, label, values }
  })
  if (JSON.stringify(details).length > PRODUCT_LIMITS.detailPayload) invalid('details payload is too large')
  return details
}

export function validateProductOrderUrl(value: unknown): string | null {
  const normalized = normalizeOptionalProductString(value, 'order_url', PRODUCT_LIMITS.orderUrl)
  if (normalized === null) return null
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    invalid('order_url must be an absolute HTTPS URL')
  }
  if (url.protocol !== 'https:' || !url.hostname) invalid('order_url must be an absolute HTTPS URL')
  if (url.username || url.password) invalid('order_url must not contain credentials')
  let fragment = url.hash.slice(1)
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const decoded = decodeURIComponent(fragment)
      if (decoded === fragment) break
      fragment = decoded
    }
  } catch {
    invalid('order_url fragment must use valid percent encoding')
  }
  if (/(?:^|[^a-z])(?:javascript|data)\s*:/i.test(fragment)) {
    invalid('order_url fragment contains an unsafe protocol')
  }
  return url.toString()
}

export function validateProductRobots(value: unknown): string | null {
  const normalized = normalizeOptionalProductString(value, 'robots', PRODUCT_LIMITS.robots)
  if (normalized !== null && !PRODUCT_ROBOTS_DIRECTIVES.has(normalized)) {
    invalid('robots must be a supported directive')
  }
  return normalized
}

export function validateProductCanonicalUrl(value: unknown): string | null {
  const normalized = normalizeOptionalProductString(value, 'canonical_url', PRODUCT_LIMITS.canonicalUrl)
  if (normalized === null) return null
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    invalid('canonical_url must be an absolute HTTPS URL')
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    invalid('canonical_url must be an absolute HTTPS URL without credentials')
  }
  return url.toString()
}
