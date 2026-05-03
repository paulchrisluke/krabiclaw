export const formatGoogleTime = (time: { hours?: number; minutes?: number }) => {
  if (time.hours === undefined || time.minutes === undefined) return ''
  const h = time.hours % 12 || 12
  const m = time.minutes.toString().padStart(2, '0')
  const ampm = time.hours >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
}

export const formatGoogleHours = (regularHours: any) => {
  if (!regularHours || !regularHours.periods) return []

  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  
  return days.map(day => {
    const period = regularHours.periods.find((p: any) => p.openDay === day)
    return {
      day: day.charAt(0) + day.slice(1).toLowerCase(),
      hours: period 
        ? `${formatGoogleTime(period.openTime)} – ${formatGoogleTime(period.closeTime)}`
        : 'Closed'
    }
  })
}

export const getTodayGoogleHours = (regularHours: any) => {
  if (!regularHours || !regularHours.periods) return 'Contact us for hours'
  
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const today = days[new Date().getDay()]
  const period = regularHours.periods.find((p: any) => p.openDay === today)
  
  if (!period) return 'Closed today'
  
  return `Open today: ${formatGoogleTime(period.openTime)} – ${formatGoogleTime(period.closeTime)}`
}

export const getSchemaOpeningHours = (regularHours: any) => {
  if (!regularHours || !regularHours.periods) return []

  const dayMap: Record<string, string> = {
    MONDAY: 'Monday',
    TUESDAY: 'Tuesday',
    WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday',
    FRIDAY: 'Friday',
    SATURDAY: 'Saturday',
    SUNDAY: 'Sunday'
  }

  return regularHours.periods.map((p: any) => {
    const pad = (n?: number) => n?.toString().padStart(2, '0') || '00'
    return {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [dayMap[p.openDay]],
      opens: `${pad(p.openTime.hours)}:${pad(p.openTime.minutes)}`,
      closes: `${pad(p.closeTime.hours)}:${pad(p.closeTime.minutes)}`
    }
  })
}

export const getSpecialHoursNotice = (specialHours: any) => {
  if (!specialHours || !specialHours.specialHourPeriods) return null

  const now = new Date()
  const todayDate = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  }

  const special = specialHours.specialHourPeriods.find((p: any) => 
    p.startDate.year === todayDate.year && 
    p.startDate.month === todayDate.month && 
    p.startDate.day === todayDate.day
  )

  if (!special) return null

  if (special.isClosed) {
    return 'Closed today for holiday/special event'
  }

  return `Special holiday hours today: ${formatGoogleTime(special.openTime)} – ${formatGoogleTime(special.closeTime)}`
}
