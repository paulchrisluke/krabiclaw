import {defineHandler} from 'nitro'
import {getQuery} from 'nitro/h3'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {readPaymentOrder} from '~/server/domain/payments/orders'
import {listPayments,paymentSummary,requirePayment,authorizePayments} from '~/server/domain/payments'
import {queryAll,queryFirst} from '~/server/db'
import {getStripeConnectedAccount} from '~/server/utils/stripe-connect'
import {createStripeClient} from '~/server/utils/stripe-client'
export default defineHandler(async event=>{
 const {db,env,organization,userId}=await getDashboardContext(event,{})
 const principal={organizationId:organization.id,userId,role:organization.role}
 const query=getQuery(event),now=new Date(),from=typeof query.from==='string'?query.from:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),to=typeof query.to==='string'?query.to:now.toISOString()
 await authorizePayments(principal,'read')
 if(typeof query.payment_id==='string'){
  const payment=await requirePayment(db,organization.id,query.payment_id)
  const [refunds,disputes]=await Promise.all([queryAll(db,'SELECT * FROM payment_refunds WHERE payment_id=?',[payment.id]),queryAll(db,'SELECT * FROM payment_disputes WHERE payment_id=?',[payment.id])])
  const booking=payment.subject_type==='booking'?await queryFirst<{request_id:string|null}>(db,'SELECT request_id FROM bookings WHERE id=? AND organization_id=?',[payment.subject_id,organization.id]):null
  return jsonResponse({payment,refunds,disputes,booking_request_id:booking?.request_id??null,order:await readPaymentOrder(db,organization.id,payment.id)})
 }
 if(query.view==='payouts'){
  await authorizePayments(principal,'payouts')
  const account=await getStripeConnectedAccount(db,organization.id)
  if(!account?.stripeAccountId || !env.STRIPE_SECRET_KEY) return jsonResponse({configured:false,available:[],pending:[],payouts:[]})
  const stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),options={stripeAccount:account.stripeAccountId}
  const [balance,payouts]=await Promise.all([stripe.balance.retrieve({},options),stripe.payouts.list({limit:50},options)])
  return jsonResponse({configured:true,balance,payouts:payouts.data,source:'Stripe',refreshed_at:new Date().toISOString()})
 }
 if(query.view==='refunds' || query.view==='disputes'){
  if(query.view==='disputes') await authorizePayments(principal,'disputes')
  const table=query.view==='refunds'?'payment_refunds':'payment_disputes'
  return jsonResponse({rows:await queryAll(db,`SELECT r.*,p.currency,p.subject_type,p.subject_id FROM ${table} r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=? ORDER BY r.updated_at DESC LIMIT 100`,[organization.id])})
 }
 return jsonResponse({summary:await paymentSummary(db,principal,from,to),...await listPayments(db,principal,{from,to,after:typeof query.after==='string'?query.after:undefined})})
})
