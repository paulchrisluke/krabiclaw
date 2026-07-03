/**
 * Utilities for formatting dates and times with a specific timezone.
 */

/**
 * Formats a time string (e.g., "14:00") into a 12-hour AM/PM format (e.g., "2:00 PM").
 * 
 * If a date is provided, it combines them. If no timezone is provided, it uses the local browser timezone.
 * We use Intl.DateTimeFormat to ensure consistent, localized formatting.
 */
export function formatTime12Hour(timeStr: string, _timezone?: string | null): string {
  if (!timeStr) return ''
  
  // Create a dummy date using the provided time.
  // We use 2000-01-01 to avoid DST edge cases when just parsing a time.
  const parts = timeStr.split(':')
  const date = new Date(Date.UTC(2000, 0, 1, parseInt(parts[0] ?? '0', 10), parseInt(parts[1] ?? '0', 10)))

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC', // We parse as UTC above, so we format as UTC to just get the time string out safely without browser offset shifting it, UNLESS we are calculating a real date with a timezone offset.
  }

  // If a timezone is provided, we need a real date object in that timezone.
  // However, time slots in our database are typically stored as literal "14:00" local time.
  // So "14:00" in Asia/Bangkok means 14:00 local time.
  // We don't want the browser to shift this based on the user's timezone.
  // So we just want to convert the *string* "14:00" to "2:00 PM", regardless of timezone.
  
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

/**
 * Calculates an end time given a start time string (e.g., "14:00") and a duration in minutes.
 * Returns the end time string (e.g., "15:30").
 */
export function calculateEndTimeStr(startTimeStr: string, durationMinutes: number): string {
  if (!startTimeStr) return ''
  if (!durationMinutes) return startTimeStr
  
  const parts2 = startTimeStr.split(':')
  const startHours = parseInt(parts2[0] ?? '0', 10)
  const startMinutes = parseInt(parts2[1] ?? '0', 10)
  
  const totalMinutes = startHours * 60 + startMinutes + durationMinutes
  
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMins = totalMinutes % 60
  
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`
}

/**
 * Formats a time slot with an optional duration into a rich string.
 * E.g., start: "14:00", duration: 90 -> "2:00 PM – 3:30 PM"
 * E.g., start: "11:00", duration: null -> "11:00 AM"
 */
export function formatTimeSlot(startTimeStr: string, durationMinutes?: number | null): string {
  const startFormatted = formatTime12Hour(startTimeStr)
  if (!durationMinutes) {
    return startFormatted
  }
  
  const endTimeStr = calculateEndTimeStr(startTimeStr, durationMinutes)
  const endFormatted = formatTime12Hour(endTimeStr)
  
  return `${startFormatted} – ${endFormatted}`
}
