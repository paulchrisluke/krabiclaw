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

/**
 * The currency a country's businesses price in, for the currencies this platform
 * supports. Onboarding proposes this from the country the owner gave, and the
 * owner confirms or changes it on the currency step — so it seeds an answer, it
 * never stands in for one.
 *
 * A country outside this map returns null. That is not a gap to paper over with
 * USD: it means this platform cannot price in that country's currency yet, and
 * the owner picks from the supported list themselves.
 */
const COUNTRY_CURRENCIES: Readonly<Record<string, CurrencyCode>> = Object.freeze({
  TH: 'THB',
  US: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  AU: 'AUD',
  CA: 'CAD',
  SG: 'SGD',
  HK: 'HKD',
  MY: 'MYR',
  ID: 'IDR',
  PH: 'PHP',
  VN: 'VND',
  IN: 'INR',
  // The euro area, plus the microstates and territories that use the euro under
  // monetary agreement.
  AD: 'EUR', AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR',
  FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR',
  LU: 'EUR', LV: 'EUR', MC: 'EUR', ME: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR',
  SI: 'EUR', SK: 'EUR', SM: 'EUR', VA: 'EUR', XK: 'EUR',
})

/** The currency to propose for an ISO 3166-1 alpha-2 country, or null when there is none. */
export function currencyForCountry(country: string | null | undefined): CurrencyCode | null {
  if (typeof country !== 'string') return null
  return COUNTRY_CURRENCIES[country.trim().toUpperCase()] ?? null
}

export const CURRENCY_FRACTION_DIGITS: Readonly<Record<CurrencyCode, 0 | 2>> = Object.freeze({
  THB: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, AUD: 2, CAD: 2,
  SGD: 2, HKD: 2, MYR: 2, IDR: 2, PHP: 2, VND: 0, INR: 2,
})

export function currencyFractionDigits(currency: CurrencyCode): 0 | 2 {
  return CURRENCY_FRACTION_DIGITS[currency]
}

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
