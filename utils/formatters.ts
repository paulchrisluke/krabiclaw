export const formatGoogleTime = (time: { hours?: number; minutes?: number }) => {
  if (time.hours === undefined || time.minutes === undefined) return ''
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
function parseTimeStr(t: unknown): GoogleTime {
  if (typeof t === 'object' && t !== null) return t as GoogleTime
  const str = String(t ?? '')
  const [h, m] = str.split(':').map(Number)
  return { hours: isNaN(h) ? 0 : h, minutes: isNaN(m) ? 0 : m }
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

export const getTodayGoogleHours = (regularHours: GoogleRegularHours | GoogleRegularPeriod[] | null | undefined) => {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const today = days[new Date().getDay()]

  const periods: GoogleRegularPeriod[] = Array.isArray(regularHours)
    ? (regularHours as GoogleRegularPeriod[])
    : (regularHours as GoogleRegularHours)?.periods ?? []

  if (!periods.length) return 'Contact us for hours'

  const period = periods.find((p) => p.openDay === today)
  if (!period) return 'Closed today'

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
