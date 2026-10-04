import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {readPaymentOrder} from '~/server/domain/payments/orders'
import {listPayments,paymentSummary,requirePayment,authorizePayments} from '~/server/domain/payments'
import {queryAll,queryFirst} from '~/server/db'
import {getStripeConnectedAccount,stripeLivemodeFromKey} from '~/server/utils/stripe-connect'
import {createStripeClient} from '~/server/utils/stripe-client'
export default defineHandler(async event=>{
 const {db,env,organization,userId}=await getDashboardContext(event,{})
 const principal={organizationId:organization.id,userId,role:organization.role}
 const query=getQuery(event),now=new Date(),from=typeof query.from==='string'?query.from:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),to=typeof query.to==='string'?query.to:now.toISOString()
 await authorizePayments(principal,'read')
 if(query.after!==undefined&&(typeof query.after!=='string'||!query.after))throw new HTTPError({statusCode:400,statusMessage:'Valid page cursor is required'})
 const after=typeof query.after==='string'?query.after:undefined
 if(typeof query.payment_id==='string'){
  const payment=await requirePayment(db,organization.id,query.payment_id)
  const [refunds,disputes]=await Promise.all([queryAll(db,'SELECT * FROM payment_refunds WHERE payment_id=?',[payment.id]),queryAll(db,'SELECT * FROM payment_disputes WHERE payment_id=?',[payment.id])])
  const booking=payment.subject_type==='booking'?await queryFirst<{request_id:string|null}>(db,'SELECT request_id FROM bookings WHERE id=? AND organization_id=?',[payment.subject_id,organization.id]):null
  return jsonResponse({payment,refunds,disputes,booking_request_id:booking?.request_id??null,order:await readPaymentOrder(db,organization.id,payment.id)})
 }
 if(query.view==='payouts'){
  await authorizePayments(principal,'payouts')
  const account=await getStripeConnectedAccount(db,organization.id)
  if(!account?.stripeAccountId) return jsonResponse({configured:false,available:[],pending:[],payouts:[],next_cursor:null})
  if(!env.STRIPE_SECRET_KEY)throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
  if(account.livemode!==stripeLivemodeFromKey(env.STRIPE_SECRET_KEY))throw new HTTPError({statusCode:409,statusMessage:'Connected Stripe account mode does not match configuration'})
  const stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),options={stripeAccount:account.stripeAccountId}
  const [balance,payouts]=await Promise.all([stripe.balance.retrieve({},options),stripe.payouts.list({limit:50,...(after?{starting_after:after}:{})},options)])
  if(balance.livemode!==account.livemode||payouts.data.some(row=>row.livemode!==account.livemode))throw new Error('Stripe payout mode does not match connected account')
  const nextCursor=payouts.has_more?payouts.data.at(-1)?.id:null
  if(payouts.has_more&&!nextCursor)throw new Error('Stripe payout list is missing its next cursor')
  return jsonResponse({configured:true,balance,payouts:payouts.data,next_cursor:nextCursor,source:'Stripe',refreshed_at:new Date().toISOString()})
 }
 if(query.view==='refunds' || query.view==='disputes'){
  if(query.view==='disputes') await authorizePayments(principal,'disputes')
  const table=query.view==='refunds'?'payment_refunds':'payment_disputes'
  const cursor=after?await queryFirst<{id:string;updated_at:string}>(db,`SELECT r.id,r.updated_at FROM ${table} r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=? AND r.id=?`,[organization.id,after]):null
  if(after&&!cursor)throw new HTTPError({statusCode:404,statusMessage:'Financial page cursor not found'})
  const rows=await queryAll<{id:string}>(db,`SELECT r.*,p.currency,p.subject_type,p.subject_id FROM ${table} r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=?${cursor?' AND (r.updated_at<? OR (r.updated_at=? AND r.id<?))':''} ORDER BY r.updated_at DESC,r.id DESC LIMIT 101`,[organization.id,...(cursor?[cursor.updated_at,cursor.updated_at,cursor.id]:[])])
  return jsonResponse({rows:rows.slice(0,100),next_cursor:rows.length>100?rows[99]!.id:null,source:'Stripe authenticated projections',refreshed_at:new Date().toISOString()})
 }
 return jsonResponse({summary:await paymentSummary(db,principal,from,to),...await listPayments(db,principal,{from,to,after})})
})
