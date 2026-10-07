import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { reassignBookingProvider } from '~/server/domain/provider-reassignment'
export default defineHandler(async event=>{const {env,organization,userId}=await getDashboardContext(event,{});const booking_id=getRouterParam(event,'bookingId');const body=await readBody<Omit<Parameters<typeof reassignBookingProvider>[1],'booking_id'>>(event);if(!body||!booking_id)throw new HTTPError({statusCode:400,message:'Booking and reassignment fields required'});return jsonResponse(await reassignBookingProvider({env,organizationId:organization.id,userId},{...body,booking_id}))})
