const UTC_ALIASES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Z'])

export const TIMEZONE_OPTIONS = (() => {
  const options = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : []
  return options.includes('UTC') ? options : ['UTC', ...options]
})()

export function normalizeTimezone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return UTC_ALIASES.has(trimmed) ? 'UTC' : trimmed
}

export function isValidTimezone(value: string | null | undefined): value is string {
  const normalized = normalizeTimezone(value)
  if (!normalized) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized })
    return true
  } catch {
    return false
  }
}

export function getLocalTimezone(fallback = 'UTC'): string {
  try {
    const resolved = normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (resolved && isValidTimezone(resolved)) return resolved
  } catch {
    // Ignore runtime-specific Intl failures and fall back below.
  }

  return fallback
}
