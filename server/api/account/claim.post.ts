import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {createPurchaseClaim,claimPurchase} from '~/server/domain/payments/buyer'
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session) throw new HTTPError({statusCode:401,statusMessage:'Sign in to manage purchase claims'})
 const body=await readRequiredBody<{payment_id?:string;claim_code?:string}>(event)
 if(body.payment_id && !body.claim_code) return jsonResponse(await createPurchaseClaim(env.DB,session.user.id,body.payment_id))
 if(!session.user.emailVerified || 'isAnonymous' in session.user && session.user.isAnonymous) throw new HTTPError({statusCode:403,statusMessage:'Verify your account email before claiming a purchase'})
 if(!body.claim_code) throw new HTTPError({statusCode:400,statusMessage:'Purchase claim code required'})
 return jsonResponse(await claimPurchase(env.DB,session.user.id,body.claim_code))
})
