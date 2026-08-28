export const APP_DEFAULT_LOCALE = 'en' as const
export type AppLocale = string

export function normalizeAppLocale(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const canonical = Intl.getCanonicalLocales(value.trim())
    return canonical.length === 1 ? canonical[0] ?? null : null
  } catch {
    return null
  }
}
export function resolveAppLocale(value: unknown): string {
  return normalizeAppLocale(value) ?? APP_DEFAULT_LOCALE
}

export function switchAppLocalePath(
  representations: ReadonlyArray<{ locale: string; route_path: string }>,
  locale: unknown,
): string | null {
  const normalized = normalizeAppLocale(locale)
  if (!normalized) return null
  return representations.find(item => item.locale === normalized)?.route_path ?? null
}
