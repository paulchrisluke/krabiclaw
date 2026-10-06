import {defineHandler,HTTPError} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {requireFinancialBrowserOrigin} from '~/server/utils/financial-browser'
import {authorizePayments} from '~/server/domain/payments'
import {createPaymentCheckout} from '~/server/domain/payments/checkout'
import {createStripeClient} from '~/server/utils/stripe-client'
export default defineHandler(async event=>{
 requireFinancialBrowserOrigin(event)
 const {db,env,organization,userId}=await getDashboardContext(event,{})
 await authorizePayments({organizationId:organization.id,userId,role:organization.role},'create')
 const body=await readRequiredBody<{product_id?:string;variant_id?:string;quantity?:number;idempotency_key?:string}>(event)
 if(typeof body.product_id!=='string'||!body.product_id||typeof body.variant_id!=='string'||!body.variant_id||typeof body.idempotency_key!=='string'||!body.idempotency_key||typeof body.quantity!=='number')throw new HTTPError({statusCode:400,statusMessage:'An offering, quantity and stable checkout request are required'})
 if(!env.STRIPE_SECRET_KEY||!env.NUXT_PUBLIC_PLATFORM_DOMAIN)throw new HTTPError({statusCode:503,statusMessage:'Stripe Payments is not configured'})
 return jsonResponse(await createPaymentCheckout(db,createStripeClient(env.STRIPE_SECRET_KEY,'payments'),env,{organizationId:organization.id,buyerUserId:null,productId:body.product_id,variantId:body.variant_id,quantity:body.quantity,idempotencyKey:body.idempotency_key,returnOrigin:env.NUXT_PUBLIC_PLATFORM_DOMAIN}))
})
