export const SUPPORTED_CURRENCIES = [
  'THB',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'HKD',
  'MYR',
  'IDR',
  'PHP',
  'VND',
  'INR',
] as const

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number]

export const DEFAULT_CURRENCY: CurrencyCode = 'THB'

export const CURRENCY_OPTIONS: Array<{ label: string; value: CurrencyCode }> = [
  { label: 'Thai Baht (THB)', value: 'THB' },
  { label: 'US Dollar (USD)', value: 'USD' },
  { label: 'Euro (EUR)', value: 'EUR' },
  { label: 'British Pound (GBP)', value: 'GBP' },
  { label: 'Japanese Yen (JPY)', value: 'JPY' },
  { label: 'Australian Dollar (AUD)', value: 'AUD' },
  { label: 'Canadian Dollar (CAD)', value: 'CAD' },
  { label: 'Singapore Dollar (SGD)', value: 'SGD' },
  { label: 'Hong Kong Dollar (HKD)', value: 'HKD' },
  { label: 'Malaysian Ringgit (MYR)', value: 'MYR' },
  { label: 'Indonesian Rupiah (IDR)', value: 'IDR' },
  { label: 'Philippine Peso (PHP)', value: 'PHP' },
  { label: 'Vietnamese Dong (VND)', value: 'VND' },
  { label: 'Indian Rupee (INR)', value: 'INR' },
]

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
}
