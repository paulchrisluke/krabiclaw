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

export const formatGoogleHours = (regularHours: GoogleRegularHours | null | undefined) => {
  if (!regularHours?.periods?.length) return []

  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  
  return days.map(day => {
    const period = regularHours.periods?.find((p) => p.openDay === day)
    return {
      day: day.charAt(0) + day.slice(1).toLowerCase(),
      hours: period 
        ? `${formatGoogleTime(period.openTime ?? {})} – ${formatGoogleTime(period.closeTime ?? {})}`
        : 'Closed'
    }
  })
}

export const getTodayGoogleHours = (regularHours: GoogleRegularHours | null | undefined) => {
  if (!regularHours?.periods?.length) return 'Contact us for hours'
  
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const today = days[new Date().getDay()]
  const period = regularHours.periods.find((p) => p.openDay === today)
  
  if (!period) return 'Closed today'
  
  return `Open today: ${formatGoogleTime(period.openTime ?? {})} – ${formatGoogleTime(period.closeTime ?? {})}`
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
