import {defineHandler,HTTPError} from 'nitro'
import {getQuery} from 'nitro/h3'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse} from '~/server/utils/api-response'
import {readPaymentOrder} from '~/server/domain/payments/orders'
import {listPayments,paymentSummary,paymentPayouts,requirePayment,authorizePayments} from '~/server/domain/payments'
import {paymentsBillingPricing} from '~/server/domain/payments/usage'
import {queryAll,queryFirst} from '~/server/db'
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
 if(query.view==='payouts')return jsonResponse(await paymentPayouts(db,env,principal,after))
 if(query.view==='refunds' || query.view==='disputes'){
  if(query.view==='disputes') await authorizePayments(principal,'disputes')
  const table=query.view==='refunds'?'payment_refunds':'payment_disputes'
  const cursor=after?await queryFirst<{id:string;updated_at:string}>(db,`SELECT r.id,r.updated_at FROM ${table} r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=? AND r.id=?`,[organization.id,after]):null
  if(after&&!cursor)throw new HTTPError({statusCode:404,statusMessage:'Financial page cursor not found'})
  const rows=await queryAll<{id:string}>(db,`SELECT r.*,p.currency,p.subject_type,p.subject_id FROM ${table} r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=?${cursor?' AND (r.updated_at<? OR (r.updated_at=? AND r.id<?))':''} ORDER BY r.updated_at DESC,r.id DESC LIMIT 101`,[organization.id,...(cursor?[cursor.updated_at,cursor.updated_at,cursor.id]:[])])
  return jsonResponse({rows:rows.slice(0,100),next_cursor:rows.length>100?rows[99]!.id:null,source:'Stripe authenticated projections',refreshed_at:new Date().toISOString()})
 }
 const pricing=query.view==='overview'?(await paymentsBillingPricing(db,env,organization.id)).pricing:undefined
 return jsonResponse({summary:await paymentSummary(db,principal,from,to),...await listPayments(db,principal,{from,to,after}),...(query.view==='overview'?{pricing}:{})})
})
