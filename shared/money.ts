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
