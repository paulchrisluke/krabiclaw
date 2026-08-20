export const APP_DEFAULT_LOCALE = 'en' as const

export const APP_LOCALES = [
  { code: 'en', name: 'English', language: 'en-US', dir: 'ltr' },
  { code: 'th', name: 'ไทย', language: 'th-TH', dir: 'ltr' },
] as const

export type AppLocale = typeof APP_LOCALES[number]['code']

const APP_LOCALE_CODES = new Set<string>(APP_LOCALES.map(locale => locale.code))

export function normalizeAppLocale(value: unknown): AppLocale | null {
  if (typeof value !== 'string') return null
  const locale = value.trim()
  return APP_LOCALE_CODES.has(locale) ? locale as AppLocale : null
}

export function resolveAppLocale(value: unknown): AppLocale {
  return normalizeAppLocale(value) ?? APP_DEFAULT_LOCALE
}

export function switchAppLocalePath(path: string, locale: unknown): string | null {
  return normalizeAppLocale(locale) ? path : null
}
