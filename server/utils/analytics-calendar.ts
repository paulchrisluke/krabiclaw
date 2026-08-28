import { HTTPError } from 'nitro'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year!, month! - 1, day!))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day
}

export function addLocalDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function localDateAt(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function localPartsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export function localMidnightUtc(date: string, timeZone: string): Date {
  if (!DATE_PATTERN.test(date)) throw new Error('Invalid local date')
  const [year, month, day] = date.split('-').map(Number)
  let guess = Date.UTC(year!, month! - 1, day!, 0, 0, 0)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localPartsAt(new Date(guess), timeZone)
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    )
    const target = Date.UTC(year!, month! - 1, day!, 0, 0, 0)
    const adjusted = guess + (target - represented)
    if (adjusted === guess) break
    guess = adjusted
  }
  return new Date(guess)
}

export function localDateBounds(date: string, timeZone: string) {
  return {
    start: localMidnightUtc(date, timeZone).toISOString(),
    end: localMidnightUtc(addLocalDays(date, 1), timeZone).toISOString(),
  }
}

export function enumerateLocalDates(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let date = startDate; date <= endDate; date = addLocalDays(date, 1)) dates.push(date)
  return dates
}

export function parseAnalyticsRange(input: {
  startDate?: string
  endDate?: string
  timeZone: string
  now: Date
}): { startDate: string; endDate: string; dates: string[]; previousStartDate: string; previousEndDate: string } {
  const today = localDateAt(input.now, input.timeZone)
  const endDate = input.endDate ?? today
  const startDate = input.startDate ?? addLocalDays(endDate, -29)
  for (const [name, value] of [['startDate', startDate], ['endDate', endDate]] as const) {
    if (!isValidCalendarDate(value)) {
      throw new HTTPError({ statusCode: 400, statusMessage: `${name} must be a valid YYYY-MM-DD date` })
    }
  }
  if (startDate > endDate) throw new HTTPError({ statusCode: 400, statusMessage: 'startDate must not be after endDate' })
  const dates = enumerateLocalDates(startDate, endDate)
  if (dates.length > 365) throw new HTTPError({ statusCode: 400, statusMessage: 'Date range exceeds the 365-day maximum' })
  return {
    startDate,
    endDate,
    dates,
    previousStartDate: addLocalDays(startDate, -dates.length),
    previousEndDate: addLocalDays(startDate, -1),
  }
}
