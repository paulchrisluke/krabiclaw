import { jsonResponse } from '~/server/utils/api-response'
import { generateSlots } from '~/server/utils/experiences'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const start = typeof query.start === 'string' ? query.start : ''
  const end = typeof query.end === 'string' ? query.end : ''
  const interval = Number(query.interval_minutes)

  try {
    const slots = generateSlots(start, end, interval)
    return jsonResponse({ slots })
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 400
    const statusMessage = (error as { statusMessage?: string })?.statusMessage ?? 'Invalid slot generator input'
    return jsonResponse({ error: statusMessage }, { status: statusCode })
  }
})
