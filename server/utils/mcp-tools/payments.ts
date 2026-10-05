import {HTTPError} from 'nitro'
import {NOT_HANDLED,type McpExecutorContext} from './execution'
import {authorizePayments,listPayments,paymentSummary,paymentPayouts,requestRefundAuthorization,requirePayment,refundPayment} from '~/server/domain/payments'
import {createPaymentCheckout} from '~/server/domain/payments/checkout'
import {paymentsUsageStatus} from '~/server/domain/payments/usage'
import {createStripeClient} from '~/server/utils/stripe-client'
import {queryAll} from '~/server/db'
import {assertRoleAllows} from '~/server/utils/member-access'
import {organizationTool,type McpToolDefinition} from './shared'
const string={type:'string'} as const
const period={from:{...string,description:'Inclusive UTC ISO instant'},to:{...string,description:'Exclusive UTC ISO instant'}}
export const PAYMENTS_TOOLS:McpToolDefinition[]=[
 organizationTool({name:'get_payment_summary',description:'Report seller captured volume, refunds and disputes separately by currency in a UTC period. Trust receipts are not labeled earned revenue. Existing records remain serviceable after downgrade.',domain:'payments',minimumRole:'admin',confirmRequired:false,inputSchema:period,required:['from','to']}),
 organizationTool({name:'list_payments',description:'List tenant customer Payments with canonical payable links and currency minor amounts. Cursor pages seller records, never platform subscription transactions.',domain:'payments',minimumRole:'admin',confirmRequired:false,inputSchema:{...period,after:string,location_id:string,earnings_type:{type:'string',enum:['paid','refunded'],description:'Only payments still paid, or only ones with a refund'}},required:['from','to']}),
 organizationTool({name:'get_payment',description:'Read one seller Payment, immutable purchase snapshot, refund and dispute projections.',domain:'payments',minimumRole:'admin',confirmRequired:false,inputSchema:{payment_id:string},required:['payment_id']}),
 organizationTool({name:'get_payment_payouts',description:'Read connected Stripe balance and payouts with source and retrieval time. Does not transfer funds.',domain:'payments',minimumRole:'admin',confirmRequired:false}),
 organizationTool({name:'get_payments_usage',description:'Read Metronome Payments invoices, accrued usage and undelivered provider-cost events separately from Better Auth subscription billing.',domain:'payments',minimumRole:'admin',confirmRequired:false}),
 organizationTool({name:'request_payment_refund',description:'Prepare full or partial direct-charge refund for explicit authenticated browser approval. Returns a bound approval handoff; this request does not refund principal. Never treat model confirm=true as financial authorization.',domain:'payments',minimumRole:'admin',confirmRequired:true,inputSchema:{payment_id:string,amount:{type:'integer',minimum:1,description:'Refund principal in the Payment currency minor units'},note:{type:'string',maxLength:500,description:'What the buyer is told about this refund'}},required:['payment_id','amount']}),
 organizationTool({name:'issue_payment_refund',description:'Execute a seller refund only with an unexpired authorization approved by this operator in the authenticated browser. A model cannot mint the authorization. Uses connected-account native refunds, stable idempotency and current refundable principal.',domain:'payments',minimumRole:'admin',confirmRequired:true,inputSchema:{authorization_id:string},required:['authorization_id']}),
 organizationTool({name:'create_payment_checkout',description:'Create Stripe-hosted one-time order checkout for an active canonical Product/Variant without a booking calendar. Use create_product_booking for bookings and consultations. Operator checkout leaves buyer unclaimed; typed email never proves ownership. Fulfillment remains merchant-arranged.',domain:'payments',minimumRole:'admin',confirmRequired:true,requiredEntitlement:'payments',inputSchema:{product_id:string,variant_id:string,quantity:{type:'integer',minimum:1,maximum:100},idempotency_key:string},required:['product_id','variant_id','quantity','idempotency_key']}),
 organizationTool({name:'open_payments_onboarding',description:'Open authenticated merchant Stripe Payments integration management. Stripe-native onboarding collects KYC and bank details; never collect these in chat.',domain:'payments',minimumRole:'owner',confirmRequired:true}),
]

export async function handlePaymentsTools(ctx:McpExecutorContext):Promise<unknown> {
 const {db,env,organizationId,userId,role,organizationSlug}=ctx.organization
 const principal={organizationId,userId,role},args=ctx.args
 const stripe=()=>{if(!env.STRIPE_SECRET_KEY) throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'});return createStripeClient(env.STRIPE_SECRET_KEY, 'payments')}
 const dashboard=()=>{if(!organizationSlug||!env.NUXT_PUBLIC_PLATFORM_DOMAIN)throw new HTTPError({statusCode:503,statusMessage:'Payments handoff requires the organization slug and platform origin'});return `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/${encodeURIComponent(organizationSlug)}`}
 switch(ctx.toolName){
  case 'get_payment_summary':return await paymentSummary(db,principal,String(args.from),String(args.to))
  case 'list_payments':return await listPayments(db,principal,{from:String(args.from),to:String(args.to),after:typeof args.after==='string'?args.after:undefined,location_id:typeof args.location_id==='string'?args.location_id:undefined,earnings_type:args.earnings_type==='paid'||args.earnings_type==='refunded'?args.earnings_type:undefined})
  case 'get_payment':{
   await authorizePayments(principal,'read')
   const payment=await requirePayment(db,organizationId,String(args.payment_id))
   return {payment,refunds:await queryAll(db,'SELECT * FROM payment_refunds WHERE payment_id=?',[payment.id]),disputes:await queryAll(db,'SELECT * FROM payment_disputes WHERE payment_id=?',[payment.id])}
  }
  case 'get_payments_usage':await authorizePayments(principal,'read');await assertRoleAllows({organizationId,role,permissions:{billing:['read']}});return await paymentsUsageStatus(db,env,organizationId)
  case 'get_payment_payouts':return await paymentPayouts(db,env,principal)
  case 'request_payment_refund':{
   const dashboardUrl=dashboard()
   const prepared=await requestRefundAuthorization(db,principal,String(args.payment_id),Number(args.amount),'refund',typeof args.note==='string'?args.note:undefined)
   return {...prepared,approval_url:`${dashboardUrl}/earnings/refunds/approve?id=${encodeURIComponent(prepared.authorization_id)}`}
  }
  case 'issue_payment_refund':return await refundPayment(db,stripe(),principal,String(args.authorization_id),env)
  case 'create_payment_checkout':
   await authorizePayments(principal,'create')
   if(!env.NUXT_PUBLIC_PLATFORM_DOMAIN) throw new Error('Payments HTTPS platform origin missing')
   return await createPaymentCheckout(db,stripe(),env,{organizationId,buyerUserId:null,productId:String(args.product_id),variantId:String(args.variant_id),quantity:Number(args.quantity),idempotencyKey:String(args.idempotency_key),returnOrigin:env.NUXT_PUBLIC_PLATFORM_DOMAIN})
  case 'open_payments_onboarding':await authorizePayments(principal,'integration');return {organization_id:organizationId,onboarding_url:`${dashboard()}/settings/payments`,source:'Authenticated merchant Stripe-native onboarding handoff'}
  default:return NOT_HANDLED
 }
}
