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

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '—'
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return '—'

  if (isDateOnly) {
    const [year, month, day] = dateString.split('-').map(Number)
    const parsedYear = d.getUTCFullYear()
    const parsedMonth = d.getUTCMonth() + 1
    const parsedDay = d.getUTCDate()
    if (year !== parsedYear || month !== parsedMonth || day !== parsedDay) {
      return '—'
    }
  }

  // Always format in UTC, not the runtime's local timezone — this must render
  // identically during SSR (server runs in UTC) and client-side hydration
  // (the visitor's browser may be in any timezone), or Vue's hydration
  // mismatch check flags every date on the page.
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

export const formatGoogleTime = (time: { hours?: number; minutes?: number } | null | undefined) => {
  if (!time || time.hours === undefined || time.minutes === undefined) return ''
  const h = time.hours % 12 || 12
  const m = time.minutes.toString().padStart(2, '0')
  const ampm = time.hours >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
}

interface GoogleTime {
  hours?: number
  minutes?: number
}

interface GoogleRegularPeriod {
  openDay: string
  openTime?: GoogleTime
  closeTime?: GoogleTime
}

interface GoogleRegularHours {
  periods?: GoogleRegularPeriod[]
  // Simple string-time format used by seed/manual entry: openTime/closeTime are "HH:MM"
  // weekdayDescriptions format written by ChowBot
  weekdayDescriptions?: string[]
}

// Parse "HH:MM" string into {hours, minutes} object
function parseTimeStr(t: unknown): GoogleTime | null {
  if (typeof t === 'object' && t !== null) return t as GoogleTime
  if (t === null || t === undefined) return null
  const str = String(t).trim()
  if (!str) return null
  const [hoursRaw, minutesRaw] = str.split(':')
  const h = Number(hoursRaw)
  const m = Number(minutesRaw)
  if (isNaN(h)) return null
  return { hours: h, minutes: isNaN(m) ? 0 : m }
}

interface GoogleDate {
  year: number
  month: number
  day: number
}

interface GoogleSpecialPeriod {
  startDate: GoogleDate
  endDate?: GoogleDate
  isClosed?: boolean
  openTime?: GoogleTime
  closeTime?: GoogleTime
  note?: string
}

interface GoogleSpecialHours {
  specialHourPeriods?: GoogleSpecialPeriod[]
}

function compareGoogleDates(a: GoogleDate, b: GoogleDate): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

// Resolves "today" as a calendar date in the location's own timezone, since a
// closure spanning e.g. "July 4 - July 18" must compare against the
// location's local date, not the server's or visitor's.
function todayInTimezone(timezone?: string | null): GoogleDate {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
    return { year: get('year'), month: get('month'), day: get('day') }
  } catch {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  }
}

// Resolves the current weekday name and minutes-since-midnight in the
// location's own timezone, since the server (Cloudflare Workers) runs in UTC
// and comparing UTC wall-clock time against a location's local business hours
// produces wrong open/closed results (and can roll the weekday over early/late).
export function nowInTimezone(timezone?: string | null): { weekday: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date())
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toUpperCase()
    const hour = Number(parts.find(p => p.type === 'hour')?.value)
    const minute = Number(parts.find(p => p.type === 'minute')?.value)
    if (!weekday || Number.isNaN(hour) || Number.isNaN(minute)) throw new Error('invalid parts')
    return { weekday, minutes: hour * 60 + minute }
  } catch {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    const now = new Date()
    return { weekday: days[now.getDay()] as string, minutes: now.getHours() * 60 + now.getMinutes() }
  }
}

export const formatGoogleDate = (date: GoogleDate): string => {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day))
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// Finds an active date-specific closure/special-hours period for "today" in the
// location's timezone. special_hours is stored as { specialHourPeriods: [...] },
// possibly JSON-stringified. Returns undefined when no closure is currently active.
export const getActiveSpecialClosure = (
  specialHours: string | GoogleSpecialHours | null | undefined,
  timezone?: string | null,
  todayOverride?: GoogleDate,
): GoogleSpecialPeriod | undefined => {
  if (!specialHours) return undefined
  let parsed: GoogleSpecialHours | null = null
  if (typeof specialHours === 'string') {
    try {
      parsed = JSON.parse(specialHours)
    } catch {
      return undefined
    }
  } else {
    parsed = specialHours
  }

  const periods = parsed?.specialHourPeriods ?? []
  if (!periods.length) return undefined

  const today = todayOverride ?? todayInTimezone(timezone)

  return periods.find((period) => {
    if (!period.isClosed || !period.startDate) return false
    const end = period.endDate ?? period.startDate
    return compareGoogleDates(today, period.startDate) >= 0 && compareGoogleDates(today, end) <= 0
  })
}

// Guest-facing message for an active closure, e.g. "Temporarily closed —
// reopening July 18, 2026". Shared by the location page banner and by
// anything (experience cards/detail) that needs to explain why booking is
// unavailable for a location currently under a special_hours closure.
export const formatClosureMessage = (closure: GoogleSpecialPeriod | null | undefined): string | null => {
  if (!closure) return null
  if (closure.note) return closure.note
  if (!closure.endDate) return 'Temporarily closed until further notice'
  // endDate is the last closed day (getActiveSpecialClosure treats the range as
  // inclusive), so the location reopens the day after it, not on it.
  const e = closure.endDate
  const next = new Date(Date.UTC(e.year, e.month - 1, e.day + 1))
  const reopenDate = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
  return `Temporarily closed — reopening ${formatGoogleDate(reopenDate)}`
}

export const formatGoogleHours = (regularHours: GoogleRegularHours | GoogleRegularPeriod[] | null | undefined) => {
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

  // Handle weekdayDescriptions format (ChowBot plain-text storage)
  if (regularHours && !Array.isArray(regularHours) && (regularHours as GoogleRegularHours).weekdayDescriptions?.length) {
    const descs = (regularHours as GoogleRegularHours).weekdayDescriptions!
    return descs.map(line => {
      const [dayPart, ...rest] = line.split(/:\s*/)
      return { day: (dayPart ?? line).trim(), hours: rest.join(': ').trim() || line }
    })
  }

  // Handle flat array format: [{openDay, openTime, closeTime}]
  // openTime/closeTime may be "HH:MM" strings or {hours, minutes} objects
  const periods: GoogleRegularPeriod[] = Array.isArray(regularHours)
    ? (regularHours as GoogleRegularPeriod[])
    : (regularHours as GoogleRegularHours)?.periods ?? []

  if (!periods.length) return []

  return days.map(day => {
    const period = periods.find((p) => p.openDay === day)
    return {
      day: day.charAt(0) + day.slice(1).toLowerCase(),
      today: days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] === day,
      hours: period
        ? `${formatGoogleTime(parseTimeStr(period.openTime))} – ${formatGoogleTime(parseTimeStr(period.closeTime))}`
        : 'Closed'
    }
  })
}

export const getIsOpenNow = (regularHours: GoogleRegularHours | GoogleRegularPeriod[] | null | undefined, timezone?: string | null): boolean | undefined => {
  const { weekday: today, minutes: nowMinsInTz } = nowInTimezone(timezone)

  const periods: GoogleRegularPeriod[] = Array.isArray(regularHours)
    ? (regularHours as GoogleRegularPeriod[])
    : (regularHours as GoogleRegularHours)?.periods ?? []

  if (!periods.length) {
    // Fall back to parsing weekdayDescriptions (e.g. "Monday: 2:00 – 11:00 PM")
    const descs = !Array.isArray(regularHours)
      ? (regularHours as GoogleRegularHours)?.weekdayDescriptions ?? []
      : []
    if (!descs.length) return undefined

    const todayLine = descs.find(l => l.trim().toUpperCase().startsWith(today + ':'))
    if (!todayLine) return false

    const rangeStr = todayLine.replace(/^[^:]+:\s*/i, '').trim()
    if (/closed/i.test(rangeStr)) return false

    const ranges = rangeStr.split(',').map(r => r.trim()).filter(Boolean)
    
    let anyValidRange = false
    let isOpen = false
    
    for (const singleRangeStr of ranges) {
      const parts = singleRangeStr.split(/\s*[–\-]\s*/)
      if (parts.length !== 2) continue

      const parseAmPm = (s: string): { hour: number; minute: number; ampm: string | null } | null => {
        const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
        if (!m) return null
        const h = parseInt(m[1] ?? '0', 10)
        const min = parseInt(m[2] ?? '0', 10)
        const ampm = m[3]?.toUpperCase() || null
        return { hour: h, minute: min, ampm }
      }

      const openParsed = parseAmPm(parts[0] ?? '')
      const closeParsed = parseAmPm(parts[1] ?? '')
      if (!openParsed || !closeParsed) continue

      anyValidRange = true

      const toMins = (h: number, min: number, ampm: string | null): number => {
        let hour = h
        if (ampm === 'PM' && hour < 12) hour += 12
        else if (ampm === 'AM' && hour === 12) hour = 0
        return hour * 60 + min
      }

      // Infer AM/PM using hour-based inference
      let openAmpm = openParsed.ampm
      let closeAmpm = closeParsed.ampm

      if (!openAmpm && !closeAmpm) {
        // Try both AM, start AM end PM, start PM end AM
        const assignments = [
          { open: 'AM', close: 'AM' },
          { open: 'AM', close: 'PM' },
          { open: 'PM', close: 'AM' },
          { open: 'PM', close: 'PM' },
        ]
        let bestAssignment: typeof assignments[0] | null = null
        let bestDuration = -1

        for (const assignment of assignments) {
          const openMins = toMins(openParsed.hour, openParsed.minute, assignment.open)
          const closeMins = toMins(closeParsed.hour, closeParsed.minute, assignment.close)
          let duration = closeMins - openMins
          if (duration < 0) duration += 24 * 60 // Handle midnight crossing

          // Prefer positive duration <= 12h, with preference for same-day daytime spans (AM→PM)
          if (duration > 0 && duration <= 12 * 60) {
            if (bestDuration < 0 || duration < bestDuration || (assignment.open === 'AM' && assignment.close === 'PM')) {
              bestAssignment = assignment
              bestDuration = duration
            }
          }
        }

        if (bestAssignment) {
          openAmpm = bestAssignment.open
          closeAmpm = bestAssignment.close
        }
      } else if (!openAmpm && closeAmpm) {
        // Try assigning open the same marker as close
        openAmpm = closeAmpm
        const openMins = toMins(openParsed.hour, openParsed.minute, openAmpm)
        const closeMins = toMins(closeParsed.hour, closeParsed.minute, closeAmpm)
        let duration = closeMins - openMins
        if (duration < 0) duration += 24 * 60

        // If duration is negative or implausibly long (>12h), flip the inferred marker
        if (duration <= 0 || duration > 12 * 60) {
          openAmpm = closeAmpm === 'AM' ? 'PM' : 'AM'
        }
      } else if (!closeAmpm && openAmpm) {
        // Try assigning close the same marker as open
        closeAmpm = openAmpm
        const openMins = toMins(openParsed.hour, openParsed.minute, openAmpm)
        const closeMins = toMins(closeParsed.hour, closeParsed.minute, closeAmpm)
        let duration = closeMins - openMins
        if (duration < 0) duration += 24 * 60

        // If duration is negative or implausibly long (>12h), flip the inferred marker
        if (duration <= 0 || duration > 12 * 60) {
          closeAmpm = openAmpm === 'AM' ? 'PM' : 'AM'
        }
      }

      const openMins = toMins(openParsed.hour, openParsed.minute, openAmpm)
      const closeMins = toMins(closeParsed.hour, closeParsed.minute, closeAmpm)

      const nowMins = nowMinsInTz
      let rangeIsOpen = false
      if (closeMins < openMins) rangeIsOpen = nowMins >= openMins || nowMins < closeMins
      else rangeIsOpen = nowMins >= openMins && nowMins < closeMins
      
      if (rangeIsOpen) {
        isOpen = true
      }
    }
    
    if (!anyValidRange) return undefined
    return isOpen
  }

  const period = periods.find((p) => p.openDay === today)
  if (!period) return false

  const open = parseTimeStr(period.openTime)
  const close = parseTimeStr(period.closeTime)
  if (!open || !close) return undefined

  const nowMins = nowMinsInTz
  const openMins = (open.hours ?? 0) * 60 + (open.minutes ?? 0)
  const closeMins = (close.hours ?? 0) * 60 + (close.minutes ?? 0)
  if (closeMins < openMins) return nowMins >= openMins || nowMins < closeMins
  return nowMins >= openMins && nowMins < closeMins
}

export const getTodayGoogleHours = (regularHours: GoogleRegularHours | GoogleRegularPeriod[] | null | undefined, todayOverride?: string) => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const today = todayOverride ? todayOverride.toUpperCase() : days[new Date().getDay()]
  const descriptions = !Array.isArray(regularHours)
    ? (regularHours as GoogleRegularHours)?.weekdayDescriptions ?? []
    : []
  const todayDescription = descriptions.find(line => line.trim().toUpperCase().startsWith(`${today}:`))

  const periods: GoogleRegularPeriod[] = Array.isArray(regularHours)
    ? (regularHours as GoogleRegularPeriod[])
    : (regularHours as GoogleRegularHours)?.periods ?? []

  if (!periods.length) return todayDescription || 'Contact us for hours'

  const period = periods.find((p) => p.openDay === today)
  if (!period) return todayDescription || 'Closed today'

  return `${formatGoogleTime(parseTimeStr(period.openTime))} – ${formatGoogleTime(parseTimeStr(period.closeTime))}`
}

export const getSchemaOpeningHours = (regularHours: GoogleRegularHours | null | undefined) => {
  if (!regularHours?.periods?.length) {
    return [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      opens: '12:00',
      closes: '22:30'
    }]
  }

  const dayMap: Record<string, string> = {
    MONDAY: 'Monday',
    TUESDAY: 'Tuesday',
    WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday',
    FRIDAY: 'Friday',
    SATURDAY: 'Saturday',
    SUNDAY: 'Sunday'
  }

  return regularHours.periods.map((p) => {
    const pad = (n?: number) => n?.toString().padStart(2, '0') || '00'
    return {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [dayMap[p.openDay] ?? 'Monday'],
      opens: `${pad(p.openTime?.hours)}:${pad(p.openTime?.minutes)}`,
      closes: `${pad(p.closeTime?.hours)}:${pad(p.closeTime?.minutes)}`
    }
  })
}

export const getSpecialHoursNotice = (specialHours: GoogleSpecialHours | null | undefined) => {
  if (!specialHours?.specialHourPeriods?.length) return null

  const now = new Date()
  const todayDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  }

  const special = specialHours.specialHourPeriods.find((p) => 
    p.startDate.year === todayDate.year && 
    p.startDate.month === todayDate.month && 
    p.startDate.day === todayDate.day
  )

  if (!special) return null

  if (special.isClosed) {
    return 'Closed today for holiday/special event'
  }

  return `Special holiday hours today: ${formatGoogleTime(special.openTime ?? {})} – ${formatGoogleTime(special.closeTime ?? {})}`
}

/**
 * Returns '#ffffff' or '#000000' based on the luminance of the provided hex color.
 */
export const getContrastColor = (hex?: string | null) => {
  if (!hex || !hex.startsWith('#')) return '#ffffff'
  
  // Remove hash if present
  const color = hex.replace('#', '')
  
  // Convert 3-digit hex to 6-digits
  const r = parseInt(color.length === 3 ? color.slice(0, 1).repeat(2) : color.slice(0, 2), 16)
  const g = parseInt(color.length === 3 ? color.slice(1, 2).repeat(2) : color.slice(2, 4), 16)
  const b = parseInt(color.length === 3 ? color.slice(2, 3).repeat(2) : color.slice(4, 6), 16)
  
  // Luminance formula (YIQ)
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
  
  return (yiq >= 128) ? '#000000' : '#ffffff'
}
