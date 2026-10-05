import {defineHandler,HTTPError} from 'nitro'
import {cloudflareEnv,jsonResponse} from '~/server/utils/api-response'
import {getAuthSession} from '~/server/utils/auth'
import {queryAll} from '~/server/db'
import {createStripeClient} from '~/server/utils/stripe-client'
import {stripeLivemodeFromKey} from '~/server/utils/stripe-connect'
import {organizationLogo} from '~/server/notifications/hero'

export interface BuyerPaymentMethod { id:string; brand:string; last4:string; exp_month:number; exp_year:number }
export interface BuyerPaymentMethodGroup { stripe_account_id:string; organization_name:string; organization_image_url:string|null; methods:BuyerPaymentMethod[] }

/** The cards this account kept with each business, as Airbnb's Payment methods list; Stripe holds them on the business's account. */
export default defineHandler(async event=>{
 const env=cloudflareEnv(event),session=await getAuthSession(event,env)
 if(!session)throw new HTTPError({statusCode:401,statusMessage:'Sign in to view your payment methods'})
 if(!env.STRIPE_SECRET_KEY)throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
 const livemode=stripeLivemodeFromKey(env.STRIPE_SECRET_KEY)
 const rows=await queryAll<{stripe_account_id:string;stripe_customer_id:string;organization_id:string;organization_name:string}>(env.DB,'SELECT c.stripe_account_id,c.stripe_customer_id,o.id AS organization_id,o.name AS organization_name FROM payment_customers c JOIN stripe_connected_accounts a ON a.stripe_account_id=c.stripe_account_id AND a.livemode=c.livemode JOIN organization o ON o.id=a.organization_id WHERE c.user_id=? AND c.livemode=? ORDER BY o.name',[session.user.id,Number(livemode)])
 const stripe=createStripeClient(env.STRIPE_SECRET_KEY,'payments')
 const groups=await Promise.all(rows.map(async(row):Promise<BuyerPaymentMethodGroup>=>{
  const [methods,imageUrl]=await Promise.all([stripe.customers.listPaymentMethods(row.stripe_customer_id,{type:'card',limit:20},{stripeAccount:row.stripe_account_id}),organizationLogo(env.DB,row.organization_id)])
  return {stripe_account_id:row.stripe_account_id,organization_name:row.organization_name,organization_image_url:imageUrl,methods:methods.data.flatMap(method=>method.card?[{id:method.id,brand:method.card.brand,last4:method.card.last4,exp_month:method.card.exp_month,exp_year:method.card.exp_year}]:[])}
 }))
 return jsonResponse({groups:groups.filter(group=>group.methods.length)},{headers:{'cache-control':'private, no-store'}})
})
