import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {listAgenda,parseAgendaQuery} from '~/server/utils/dashboard-agenda'
import {finalizeRequestMetrics} from '~/server/utils/request-metrics'
/** The buyer's calendar and Upcoming: the same agenda the business reads, scoped to the visits this account owns. */
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your bookings'})
 const payload=await listAgenda(env.DB,{buyerUserId:session.user.id},parseAgendaQuery(getQuery(event)))
 return jsonResponse(finalizeRequestMetrics(event,'account-agenda',payload),{headers:{'cache-control':'private, no-store'}})
})
