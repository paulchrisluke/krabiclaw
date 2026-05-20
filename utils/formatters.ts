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
  isClosed?: boolean
  openTime?: GoogleTime
  closeTime?: GoogleTime
}

interface GoogleSpecialHours {
  specialHourPeriods?: GoogleSpecialPeriod[]
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

export const getIsOpenNow = (regularHours: GoogleRegularHours | GoogleRegularPeriod[] | null | undefined): boolean | undefined => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const today = days[new Date().getDay()]

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

      const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
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

  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
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
