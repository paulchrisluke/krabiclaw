import {defineHandler,HTTPError} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {authorizePayments} from '~/server/domain/payments'
import {getStripeConnectedAccount,stripeLivemodeFromKey} from '~/server/utils/stripe-connect'
import {createStripeClient} from '~/server/utils/stripe-client'
import {jsonResponse} from '~/server/utils/api-response'
import {requireFinancialBrowserOrigin} from '~/server/utils/financial-browser'
export default defineHandler(async event=>{
 requireFinancialBrowserOrigin(event)
 const {env,db,organization,userId}=await getDashboardContext(event,{})
 await authorizePayments({organizationId:organization.id,userId,role:organization.role},'integration')
 if(!env.STRIPE_SECRET_KEY)throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
 const account=await getStripeConnectedAccount(db,organization.id)
 if(!account?.stripeAccountId||account.livemode!==stripeLivemodeFromKey(env.STRIPE_SECRET_KEY))throw new HTTPError({statusCode:409,statusMessage:'Scoped Stripe account is unavailable'})
 const stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments')
 const native=await stripe.v2.core.accounts.retrieve(account.stripeAccountId)
 if(native.dashboard!=='express'||native.livemode!==account.livemode)throw new HTTPError({statusCode:409,statusMessage:'Express Dashboard financial scope mismatch'})
 const link=await stripe.accounts.createLoginLink(account.stripeAccountId)
 return jsonResponse({url:link.url})
})
