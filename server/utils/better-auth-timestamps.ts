export type BetterAuthTimestamp = Date | number | string

export function betterAuthTimestampToIso(value: BetterAuthTimestamp, fieldName = 'timestamp'): string {
  let date: Date

  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number') {
    date = new Date(value < 1_000_000_000_000 ? value * 1000 : value)
  } else {
    const trimmed = value.trim()
    const numeric = Number(trimmed)

    if (trimmed && Number.isFinite(numeric)) {
      date = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      date = new Date(`${trimmed.replace(' ', 'T')}Z`)
    } else {
      date = new Date(trimmed)
    }
  }

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Better Auth ${fieldName}: ${String(value)}`)
  }

  return date.toISOString()
}
