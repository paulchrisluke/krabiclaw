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

export function isSaleActive(fields: SaleFields, now: Date = new Date()): boolean {
  const compareAt = normalizePriceAmount(fields.compare_at_price_amount)
  const price = normalizePriceAmount(fields.price_amount)
  if (!compareAt || !price || Number(compareAt) <= Number(price)) return false
  if (fields.sale_starts_at && now < new Date(fields.sale_starts_at)) return false
  if (fields.sale_ends_at && now > new Date(fields.sale_ends_at)) return false
  return true
}
