// The week as an owner reads it and the one-line values its rows show. Shared
// by the onboarding hours step, both Hours indexes (a location's and the
// calendar's) and their leaves, so every surface states hours the same way.
import { WEEKDAYS, toTimeString, type OpeningHours, type SpecialHours, type WeekPoint } from '~/shared/reservation-hours'
import { formatCalendarDate, formatTime } from '~/utils/timezone'

export type LocationHoursForm = { timezone: string; hours: OpeningHours; specialHours: SpecialHours }
export type SpecialHoursEntry = NonNullable<SpecialHours>[number]

/** Monday first, the way a week reads on a sign in a window. WEEKDAYS is indexed from Sunday because that is what the stored WeekPoint.day means. */
export const WEEK_ROWS = [1, 2, 3, 4, 5, 6, 0].map(value => ({
  value,
  slug: WEEKDAYS[value]!,
  label: WEEKDAYS[value]![0]!.toUpperCase() + WEEKDAYS[value]!.slice(1),
}))

const clock = (point: WeekPoint) => formatTime(toTimeString(point.hour * 60 + point.minute), 'en')

/** "12:00 PM – 10:00 PM", "Open 24 hours" or "Closed", for one weekday. */
export function dayHoursSummary(hours: OpeningHours, day: number): string {
  if (!hours) return ''
  const periods = hours.periods.filter(period => period.open.day === day)
  if (!periods.length) return 'Closed'
  if (periods.some(period => !period.close)) return 'Open 24 hours'
  return periods.map(period => `${clock(period.open)} – ${clock(period.close!)}`).join(', ')
}

const date = (value: string) => value ? formatCalendarDate(value, 'en') : ''

/** The dates an exception covers, as its row names it. */
export function exceptionLabel(entry: SpecialHoursEntry): string {
  if (entry.kind === 'closure') return entry.ends_on && entry.ends_on !== entry.starts_on ? `${date(entry.starts_on)} – ${date(entry.ends_on)}` : date(entry.starts_on)
  return date(entry.date)
}

/** A dated exception's own hours; a closure has nothing to add to its dates. */
export function exceptionSummary(entry: SpecialHoursEntry): string | undefined {
  if (entry.kind === 'closure') return undefined
  return entry.periods.map(period => `${formatTime(period.open_time, 'en')} – ${formatTime(period.close_time, 'en')}`).join(', ') || undefined
}
