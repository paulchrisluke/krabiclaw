import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { addDashboardBookingNote, isDashboardBookingType } from '~/server/utils/dashboard-booking-details'

export default defineHandler(async (event) => {
  const bookingType = getRouterParam(event, 'bookingType')
  const bookingId = getRouterParam(event, 'bookingId')
  if (!isDashboardBookingType(bookingType) || !bookingId) {
    throw new HTTPError({ statusCode: 400, message: 'Valid booking type and ID are required' })
  }
  const booking = await addDashboardBookingNote(event, {
    type: bookingType,
    bookingId,
    body: await readBody(event),
  })
  return jsonResponse({ booking })
})
