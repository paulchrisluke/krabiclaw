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
  return Array.isArray(value) && value.every(entry =>
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

/** "HH:MM" (24h) → "3 PM" / "3:30 PM" (12h, no leading zero, no minutes when :00). */
export const fmt12Hour = (timeStr: string): string => {
  const [hStr, mStr] = timeStr.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Today's opening hours as a display label (e.g. "11:30 AM – 10:30 PM"), or the provided
 * closedLabel when the location has structured hours but isn't open today. Returns null when
 * the location has no structured opening_hours to read (e.g. Google Places free-text hours).
 */
export function getTodayHoursLabel(openingHours: unknown, closedLabel: string, now = new Date()): string | null {
  if (!isStructuredOpeningHours(openingHours)) return null
  const weekdayName = WEEKDAY_BY_INDEX[now.getDay()]!
  const todaysEntry = openingHours.find(entry => entry.openDay.toUpperCase() === weekdayName)
  if (!todaysEntry) return closedLabel
  return `${fmt12Hour(todaysEntry.openTime)} – ${fmt12Hour(todaysEntry.closeTime)}`
}

/**
 * Whether the location is open right now, based on structured opening_hours. Returns false
 * (rather than throwing) when hours aren't structured — callers should treat that as "unknown"
 * and avoid rendering an open/closed badge at all rather than trusting a false negative.
 * Handles overnight hours by treating ranges where closeTime <= openTime as spanning midnight.
 */
export function isOpenNow(openingHours: unknown, now = new Date()): boolean {
  if (!isStructuredOpeningHours(openingHours)) return false
  const weekdayName = WEEKDAY_BY_INDEX[now.getDay()]!
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return openingHours.some(entry => {
    if (entry.openDay.toUpperCase() !== weekdayName) return false
    const open = toMinutes(entry.openTime)
    const close = toMinutes(entry.closeTime)
    // Overnight hours: close time is earlier than or equal to open time
    if (close <= open) {
      return nowMinutes >= open || nowMinutes < close
    }
    return nowMinutes >= open && nowMinutes < close
  })
}
