import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {listTodayAgenda} from '~/server/utils/dashboard-agenda'
import {finalizeRequestMetrics} from '~/server/utils/request-metrics'
/** The buyer's Today: the same agenda the business reads, scoped to the visits this account owns. */
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your bookings'})
 const today=await listTodayAgenda(env.DB,{buyerUserId:session.user.id},{})
 return jsonResponse(finalizeRequestMetrics(event,'account-today',today),{headers:{'cache-control':'private, no-store'}})
})
