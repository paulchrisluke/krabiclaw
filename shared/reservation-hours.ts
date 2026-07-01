// Reservation time-slot generation from a location's structured opening_hours.
// Structured shape (seed-definitions/contracts.ts `openingHours`): Array<{ openDay, openTime, closeTime }>.
// Locations synced from Google Places store opening_hours as an array of free-text weekday
// descriptions instead — that shape can't be safely parsed into slots, so callers must fall
// back to a static time list for those locations.

export interface StructuredOpeningHoursEntry {
  openDay: string
  openTime: string
  closeTime: string
}

const WEEKDAY_BY_INDEX = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function isStructuredOpeningHours(value: unknown): value is StructuredOpeningHoursEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every(entry =>
    entry && typeof entry === 'object'
    && typeof (entry as StructuredOpeningHoursEntry).openDay === 'string'
    && TIME_PATTERN.test((entry as StructuredOpeningHoursEntry).openTime)
    && TIME_PATTERN.test((entry as StructuredOpeningHoursEntry).closeTime)
  )
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number]
  return h * 60 + m
}

const toTimeString = (minutes: number) => {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Generates reservation time options for a given calendar date from a location's structured
 * opening hours, at a fixed interval, stopping `lastSeatingBufferMinutes` before closing so the
 * last slot still allows a full seating. Returns [] if the location is closed that day.
 */
export function generateReservationTimes(
  openingHours: StructuredOpeningHoursEntry[],
  dateStr: string,
  { intervalMinutes = 30, lastSeatingBufferMinutes = 60 } = {},
): string[] {
  const weekdayIndex = new Date(`${dateStr}T00:00:00Z`).getUTCDay()
  const weekdayName = WEEKDAY_BY_INDEX[weekdayIndex]!
  const todaysHours = openingHours.filter(entry => entry.openDay.toUpperCase() === weekdayName)
  if (todaysHours.length === 0) return []

  const slots: string[] = []
  for (const { openTime, closeTime } of todaysHours) {
    const open = toMinutes(openTime)
    const close = toMinutes(closeTime)
    const lastSeating = close - lastSeatingBufferMinutes
    for (let t = open; t <= lastSeating; t += intervalMinutes) {
      slots.push(toTimeString(t))
    }
  }
  return [...new Set(slots)].sort()
}
