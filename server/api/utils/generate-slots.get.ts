import { jsonResponse } from '~/server/utils/api-response'
import { generateSlots } from '~/server/utils/experiences'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const start = typeof query.start === 'string' ? query.start : ''
  const end = typeof query.end === 'string' ? query.end : ''
  const interval = Number(query.interval_minutes)

  // Validate start and end are not empty
  if (!start) {
    return jsonResponse({ error: 'start parameter is required and cannot be empty' }, { status: 400 })
  }
  if (!end) {
    return jsonResponse({ error: 'end parameter is required and cannot be empty' }, { status: 400 })
  }

  // Validate start and end are time-of-day strings in HH:MM format
  const timeFormat = /^\d{2}:\d{2}$/
  if (!timeFormat.test(start)) {
    return jsonResponse({ error: 'start parameter must be in HH:MM format' }, { status: 400 })
  }
  if (!timeFormat.test(end)) {
    return jsonResponse({ error: 'end parameter must be in HH:MM format' }, { status: 400 })
  }
  const [startHours, startMinutes] = start.split(':').map(Number)
  const [endHours, endMinutes] = end.split(':').map(Number)
  if (startHours! < 0 || startHours! > 23 || startMinutes! < 0 || startMinutes! > 59) {
    return jsonResponse({ error: 'start parameter must be a valid time (hours 0-23, minutes 0-59)' }, { status: 400 })
  }
  if (endHours! < 0 || endHours! > 23 || endMinutes! < 0 || endMinutes! > 59) {
    return jsonResponse({ error: 'end parameter must be a valid time (hours 0-23, minutes 0-59)' }, { status: 400 })
  }

  // Validate interval is a finite positive number
  if (Number.isNaN(interval)) {
    return jsonResponse({ error: 'interval_minutes parameter must be a valid number' }, { status: 400 })
  }
  if (!Number.isFinite(interval)) {
    return jsonResponse({ error: 'interval_minutes parameter must be a finite number' }, { status: 400 })
  }
  if (interval <= 0) {
    return jsonResponse({ error: 'interval_minutes parameter must be a positive number' }, { status: 400 })
  }

  try {
    const slots = generateSlots(start, end, interval)
    return jsonResponse({ slots })
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 400
    const statusMessage = (error as { statusMessage?: string })?.statusMessage ?? 'Invalid slot generator input'
    return jsonResponse({ error: statusMessage }, { status: statusCode })
  }
})
