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

  // Validate start and end are valid dates
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime())) {
    return jsonResponse({ error: 'start parameter must be a valid date format' }, { status: 400 })
  }
  if (Number.isNaN(endDate.getTime())) {
    return jsonResponse({ error: 'end parameter must be a valid date format' }, { status: 400 })
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
