export type BetterAuthTimestamp = Date | number | string

function epochToDate(value: number): Date {
  const abs = Math.abs(value)
  return new Date(abs >= 100_000_000_000 ? value : value * 1000)
}

export function betterAuthTimestampToIso(value: BetterAuthTimestamp, fieldName = 'timestamp'): string {
  let date: Date

  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number') {
    date = epochToDate(value)
  } else {
    const trimmed = value.trim()
    const numeric = Number(trimmed)

    if (trimmed && Number.isFinite(numeric)) {
      date = epochToDate(numeric)
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
