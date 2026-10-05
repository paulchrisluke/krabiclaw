import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {buyerActivities} from '~/server/domain/payments/buyer'
export default defineHandler(async event=>{
 if(Object.keys(getQuery(event)).length)throw new HTTPError({statusCode:400,statusMessage:'Unsupported activity query parameter'})
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session) throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your activity'})
 return jsonResponse(await buyerActivities(env.DB,session.user.id),{headers:{'cache-control':'private, no-store'}})
})
