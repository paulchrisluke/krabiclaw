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
