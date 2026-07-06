export const CURRENCY_SYMBOLS: Record<string, string> = {
  THB: '฿',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  HKD: 'HK$',
  MYR: 'RM',
  IDR: 'Rp',
  PHP: '₱',
  VND: '₫',
  INR: '₹',
}

export function normalizePriceAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null

  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null

  const amount = Number(match[0])
  if (!Number.isFinite(amount) || amount < 0) return null

  return match[0].replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function formatMoneyAmount(amount: unknown, currency: string, emptyLabel = 'TBD'): string {
  const normalized = normalizePriceAmount(amount)
  if (!normalized) return emptyLabel
  const code = currency.trim().toUpperCase()
  const symbol = CURRENCY_SYMBOLS[code] || `${code} `
  return `${symbol}${normalized}`
}

export interface SaleFields {
  price_amount?: string | number | null
  compare_at_price_amount?: string | number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
}

// sale_starts_at/sale_ends_at are date-only ("YYYY-MM-DD") strings from <input type="date">.
// Parsing them with `new Date(str)` reads them as UTC midnight, which shifts the
// effective activation/expiry day depending on the server/client's local offset.
// Parse them as local calendar days instead so "today" always means today everywhere.
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function isSaleActive(fields: SaleFields, now: Date = new Date()): boolean {
  const compareAt = normalizePriceAmount(fields.compare_at_price_amount)
  const price = normalizePriceAmount(fields.price_amount)
  if (!compareAt || !price || Number(compareAt) <= Number(price)) return false
  if (fields.sale_starts_at) {
    const start = parseDateOnly(fields.sale_starts_at)
    if (!start || now < start) return false
  }
  if (fields.sale_ends_at) {
    const end = parseDateOnly(fields.sale_ends_at)
    if (!end) return false
    const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)
    if (now > endOfDay) return false
  }
  return true
}

export interface OverridePriceFields extends SaleFields {
  price?: string | null
}

// Experiences carry both a free-text price override (e.g. "Ask us", "Free") and a
// numeric price_amount/compare_at_price_amount pair for sale pricing. A struck-through
// compareAtPrice only makes sense next to a numeric displayed price — never next to
// a text override, which isn't a price at all.
export function resolveOverridePriceDisplay(fields: OverridePriceFields, currency: string): { price: string; compareAtPrice: string } {
  const raw = fields.price?.trim()
  const overrideAmount = raw ? parseFloat(raw) : NaN
  const isNumericOverride = !!raw && Number.isFinite(overrideAmount)
  const price = isNumericOverride
    ? formatMoneyAmount(overrideAmount, currency, '')
    : (raw || formatMoneyAmount(fields.price_amount, currency, ''))
  const priceIsNumeric = isNumericOverride || (!raw && normalizePriceAmount(fields.price_amount) !== null)
  const compareAtPrice = priceIsNumeric && isSaleActive(fields) ? formatMoneyAmount(fields.compare_at_price_amount, currency, '') : ''
  return { price, compareAtPrice }
}

export function assertValidSaleWindow(startsAt: string | null | undefined, endsAt: string | null | undefined): void {
  let start: Date | null = null
  let end: Date | null = null
  if (startsAt !== undefined && startsAt !== null && startsAt !== '') {
    start = parseDateOnly(startsAt)
    if (!start) {
      throw new Error('sale_starts_at must be a valid date')
    }
  }
  if (endsAt !== undefined && endsAt !== null && endsAt !== '') {
    end = parseDateOnly(endsAt)
    if (!end) {
      throw new Error('sale_ends_at must be a valid date')
    }
  }
  if (start && end && start > end) {
    throw new Error('sale_starts_at must be before sale_ends_at')
  }
}
