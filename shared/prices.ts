import { currencyFractionDigits, type CurrencyCode } from './currencies.ts'
import type { CatalogProviderMapping } from './ordering-catalog.ts'

export const PRICE_UNITS = ['item', 'person', 'table'] as const
export type PriceUnit = typeof PRICE_UNITS[number]
export const PRICE_TAX_BEHAVIORS = ['unspecified', 'inclusive', 'exclusive'] as const
export type PriceTaxBehavior = typeof PRICE_TAX_BEHAVIORS[number]

export interface Price {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  product_id: string
  amount_minor: number
  currency: CurrencyCode
  unit: PriceUnit
  tax_behavior: PriceTaxBehavior
  compare_at_amount_minor: number | null
  valid_from: string
  valid_until: string | null
  provenance: string
  created_by: string
  created_at: string
  provider_mappings: CatalogProviderMapping[]
}

export interface PriceInput {
  amount_minor: number
  currency?: CurrencyCode
  unit?: PriceUnit
  tax_behavior?: PriceTaxBehavior
  compare_at_amount_minor?: number | null
  valid_from?: string
  valid_until?: string | null
  provenance?: string
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function assertInstant(value: string, field: string): void {
  if (!ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO UTC instant`)
}

export function majorAmountToMinor(value: string, currency: CurrencyCode): number {
  const digits = currencyFractionDigits(currency)
  const pattern = digits === 0 ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
  if (!pattern.test(value)) throw new Error(`${currency} amounts must use at most ${digits} fraction digits`)
  const [whole, fraction = ''] = value.split('.')
  const minor = Number(whole) * (10 ** digits) + Number(fraction.padEnd(digits, '0') || 0)
  if (!Number.isSafeInteger(minor)) throw new Error('amount exceeds safe integer range')
  return minor
}

export function formatMinorAmount(amountMinor: number, currency: CurrencyCode, locale = 'en-US'): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('amount_minor must be a non-negative safe integer')
  const digits = currencyFractionDigits(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(amountMinor / (10 ** digits))
}

export function minorAmountToMajor(amountMinor: number, currency: CurrencyCode): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('amount_minor must be a non-negative safe integer')
  const digits = currencyFractionDigits(currency)
  return digits === 0 ? String(amountMinor) : (amountMinor / (10 ** digits)).toFixed(digits)
}

export function assertNonOverlappingPrices(prices: readonly Price[]): void {
  const ordered = [...prices].sort((left, right) => left.valid_from.localeCompare(right.valid_from))
  for (const price of ordered) {
    assertInstant(price.valid_from, 'valid_from')
    if (price.valid_until) {
      assertInstant(price.valid_until, 'valid_until')
      if (price.valid_until <= price.valid_from) throw new Error('price validity interval must be positive')
    }
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    if (previous.valid_until === null || previous.valid_until > current.valid_from) throw new Error('price validity intervals overlap')
  }
}

export function priceAt(prices: readonly Price[], at = new Date().toISOString()): Price | null {
  assertInstant(at, 'at')
  assertNonOverlappingPrices(prices)
  return prices.find(price => price.valid_from <= at && (price.valid_until === null || at < price.valid_until)) ?? null
}

export function replacePrice(
  current: Price,
  replacement: Omit<Price, 'organization_id' | 'site_id' | 'location_id' | 'product_id' | 'valid_until' | 'provider_mappings'>,
): { closed: Price; replacement: Price } {
  assertInstant(replacement.valid_from, 'valid_from')
  if (current.valid_until !== null || replacement.valid_from <= current.valid_from) throw new Error('only an open price may be replaced at a later instant')
  if (replacement.compare_at_amount_minor !== null && replacement.compare_at_amount_minor <= replacement.amount_minor) {
    throw new Error('compare_at_amount_minor must exceed amount_minor')
  }
  return {
    closed: { ...current, valid_until: replacement.valid_from },
    replacement: {
      ...replacement,
      organization_id: current.organization_id,
      site_id: current.site_id,
      location_id: current.location_id,
      product_id: current.product_id,
      valid_until: null,
      provider_mappings: [],
    },
  }
}
