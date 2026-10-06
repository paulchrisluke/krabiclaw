import { getDateIntervals, isOpenNow, closureOnDate, toTimeString, type OpeningHours, type SpecialHours, type Closure } from '../shared/reservation-hours.ts'
import { localNow, formatTime, addLocalDays, formatCalendarDate } from '../utils/timezone.ts'
/** Derives up to 2 uppercase initials from a display name, for UAvatar's `text` fallback. */
export function getInitials(name: string | null | undefined): string {
  const value = name?.trim()
  if (!value) return ''
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export const getActiveSpecialClosure = (hours: SpecialHours, timezone?: string | null): Closure | undefined => {
  if (!timezone) return undefined
  return closureOnDate(hours, localNow(timezone).date)
}
export const formatClosureMessage = (closure: Closure | null | undefined): string | null => {
  if (!closure) return null
  if (closure.note) return closure.note
  return closure.ends_on ? `Temporarily closed. Reopening ${formatCalendarDate(addLocalDays(closure.ends_on, 1), 'en')}` : 'Temporarily closed until further notice'
}
export const formatOpeningHours = (hours: OpeningHours, locale = 'en', closedLabel = 'Closed', timezone?: string | null) => {
  if (hours === null) return []
  const today = timezone ? localNow(timezone).date : null
  const todayDay = today ? new Date(`${today}T00:00:00Z`).getUTCDay() : null
  return Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays('2024-01-01', index)
    const periods = getDateIntervals(hours, null, date) ?? []
    return {
      day: formatCalendarDate(date, locale, { weekday: 'long' }),
      today: (index + 1) % 7 === todayDay,
      hours: periods.length ? periods.map(p => `${formatTime(toTimeString(Math.max(0, p.start)), locale)} to ${formatTime(toTimeString(Math.min(p.end, 1440)), locale)}`).join(', ') : closedLabel,
    }
  })
}
export const getIsOpenNow = (hours: OpeningHours, timezone?: string | null, special: SpecialHours = null): boolean | undefined => isOpenNow(hours, timezone, new Date(), special)

