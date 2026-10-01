import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {buyerPayments} from '~/server/domain/payments/buyer'
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session) throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your purchases'})
 return jsonResponse(await buyerPayments(env.DB,session.user.id))
})
