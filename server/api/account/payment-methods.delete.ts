import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {queryFirst} from '~/server/db'
import {createStripeClient} from '~/server/utils/stripe-client'
import {stripeLivemodeFromKey} from '~/server/utils/stripe-connect'

/** Removes one kept card: detached at Stripe from this account's Customer on that business, nothing kept here. */
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to manage your payment methods'})
 const body=await readRequiredBody<{stripe_account_id?:string;payment_method_id?:string}>(event)
 if(typeof body.stripe_account_id!=='string'||typeof body.payment_method_id!=='string'||!/^pm_[A-Za-z0-9]+$/.test(body.payment_method_id))throw new HTTPError({statusCode:400,statusMessage:'Payment method is required'})
 if(!env.STRIPE_SECRET_KEY)throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
 const livemode=stripeLivemodeFromKey(env.STRIPE_SECRET_KEY)
 const row=await queryFirst<{stripe_customer_id:string}>(env.DB,'SELECT stripe_customer_id FROM payment_customers WHERE user_id=? AND stripe_account_id=? AND livemode=?',[session.user.id,body.stripe_account_id,Number(livemode)])
 if(!row)throw new HTTPError({statusCode:404,statusMessage:'Payment method not found'})
 const stripe=createStripeClient(env.STRIPE_SECRET_KEY,'payments')
 const method=await stripe.paymentMethods.retrieve(body.payment_method_id,{},{stripeAccount:body.stripe_account_id})
 const owner=typeof method.customer==='string'?method.customer:method.customer?.id
 if(owner!==row.stripe_customer_id)throw new HTTPError({statusCode:404,statusMessage:'Payment method not found'})
 await stripe.paymentMethods.detach(body.payment_method_id,{},{stripeAccount:body.stripe_account_id})
 return jsonResponse({removed:true})
})
