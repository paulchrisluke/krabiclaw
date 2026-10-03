import {HTTPError} from 'nitro'
import type {McpExecutorContext} from './shared'
import {NOT_HANDLED} from './shared'
import {authorizePayments,listPayments,paymentSummary,requestRefundAuthorization,requirePayment,refundPayment} from '~/server/domain/payments'
import {createPaymentCheckout} from '~/server/domain/payments/checkout'
import {paymentsUsageStatus} from '~/server/domain/payments/usage'
import {createStripeClient} from '~/server/utils/stripe-client'
import {getStripeConnectedAccount} from '~/server/utils/stripe-connect'
import {queryAll} from '~/server/db'
import {assertRoleAllows} from '~/server/utils/member-access'
export async function handlePaymentsTools(ctx:McpExecutorContext):Promise<unknown> {
 const {db,env,organizationId,userId,role,organizationSlug}=ctx.organization
 const principal={organizationId,userId,role},args=ctx.args
 const stripe=()=>{if(!env.STRIPE_SECRET_KEY) throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'});return createStripeClient(env.STRIPE_SECRET_KEY, 'payments')}
 const dashboard=()=>{if(!organizationSlug||!env.NUXT_PUBLIC_PLATFORM_DOMAIN)throw new HTTPError({statusCode:503,statusMessage:'Payments handoff requires the organization slug and platform origin'});return `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/${encodeURIComponent(organizationSlug)}`}
 switch(ctx.toolName){
  case 'get_payment_summary':return await paymentSummary(db,principal,String(args.from),String(args.to))
  case 'list_payments':return await listPayments(db,principal,{from:String(args.from),to:String(args.to),after:typeof args.after==='string'?args.after:undefined})
  case 'get_payment':{
   await authorizePayments(principal,'read')
   const payment=await requirePayment(db,organizationId,String(args.payment_id))
   return {payment,refunds:await queryAll(db,'SELECT * FROM payment_refunds WHERE payment_id=?',[payment.id]),disputes:await queryAll(db,'SELECT * FROM payment_disputes WHERE payment_id=?',[payment.id])}
  }
  case 'get_payments_usage':await authorizePayments(principal,'read');await assertRoleAllows({organizationId,role,permissions:{billing:['read']}});return await paymentsUsageStatus(db,env,organizationId)
  case 'get_payment_payouts':{
   await authorizePayments(principal,'payouts')
   const account=await getStripeConnectedAccount(db,organizationId)
   if(!account?.stripeAccountId) return {configured:false,source:'Stripe account not connected'}
   const client=stripe(),options={stripeAccount:account.stripeAccountId}
   return {organization_id:organizationId,balance:await client.balance.retrieve({},options),payouts:(await client.payouts.list({limit:50},options)).data,source:'Stripe',refreshed_at:new Date().toISOString()}
  }
  case 'request_payment_refund':{
   const dashboardUrl=dashboard()
   const prepared=await requestRefundAuthorization(db,principal,String(args.payment_id),Number(args.amount))
   return {...prepared,approval_url:`${dashboardUrl}/payments/refunds/approve?id=${encodeURIComponent(prepared.authorization_id)}`}
  }
  case 'issue_payment_refund':return await refundPayment(db,stripe(),principal,String(args.authorization_id))
  case 'create_payment_checkout':
   await authorizePayments(principal,'create')
   if(!env.NUXT_PUBLIC_PLATFORM_DOMAIN) throw new Error('Payments HTTPS platform origin missing')
   return await createPaymentCheckout(db,stripe(),env,{organizationId,buyerUserId:null,productId:String(args.product_id),variantId:String(args.variant_id),sessionId:typeof args.session_id==='string'?args.session_id:undefined,quantity:Number(args.quantity),idempotencyKey:String(args.idempotency_key),returnOrigin:env.NUXT_PUBLIC_PLATFORM_DOMAIN})
  case 'open_payments_onboarding':await authorizePayments(principal,'integration');return {organization_id:organizationId,onboarding_url:`${dashboard()}/settings/integrations/stripe`,source:'Authenticated merchant Stripe-native onboarding handoff'}
  default:return NOT_HANDLED
 }
}
