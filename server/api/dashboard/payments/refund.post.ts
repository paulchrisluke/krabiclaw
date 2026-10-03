import {requireFinancialBrowserOrigin} from '~/server/utils/financial-browser'
import {defineHandler,HTTPError} from 'nitro'
import {getDashboardContext} from '~/server/utils/dashboard-context'
import {jsonResponse,readRequiredBody} from '~/server/utils/api-response'
import {requestRefundAuthorization,approveRefundAuthorization,refundPayment,executeRefund,requirePayment} from '~/server/domain/payments'
import {queryFirst} from '~/server/db'
import {executeGuestThreadOperation} from '~/server/domain/guest-threads/operations'
import {createStripeClient} from '~/server/utils/stripe-client'
export default defineHandler(async event=>{
 requireFinancialBrowserOrigin(event)
 const {env,db,organization,userId}=await getDashboardContext(event,{})
 const principal={organizationId:organization.id,userId,role:organization.role}
 const body=await readRequiredBody<{payment_id?:string;amount?:number;authorization_id?:string;action?:string}>(event)
 if(body.action==='prepare' && body.payment_id && typeof body.amount==='number') return jsonResponse(await requestRefundAuthorization(db,principal,body.payment_id,body.amount))
 if(body.action!=='approve' || !body.authorization_id) throw new HTTPError({statusCode:400,statusMessage:'Explicit refund approval required'})
 if(!env.STRIPE_SECRET_KEY) throw new HTTPError({statusCode:503,statusMessage:'Stripe is not configured'})
 await approveRefundAuthorization(db,principal,body.authorization_id)
 const authorization=await queryFirst<{action:string;payment_id:string;amount:number}>(db,'SELECT action,payment_id,amount FROM payment_authorizations WHERE id=? AND organization_id=? AND user_id=?',[body.authorization_id,organization.id,userId])
 if(authorization?.action==='reject_booking'){
  const payment=await requirePayment(db,organization.id,authorization.payment_id)
  const booking=await queryFirst<{request_id:string|null}>(db,'SELECT request_id FROM bookings WHERE id=? AND organization_id=?',[payment.subject_id,organization.id])
  if(!booking?.request_id) throw new HTTPError({statusCode:409,statusMessage:'Paid booking request is unavailable'})
  const outcome=await executeGuestThreadOperation(db,{threadId:booking.request_id,organizationId:organization.id,action:'reject',actorUserId:userId,idempotencyKey:`paid-reject:${body.authorization_id}`,financialAuthorizationId:body.authorization_id,env})
  const refund=await queryFirst(db,'SELECT id FROM payment_refunds WHERE payment_id=? AND idempotency_key=?',[payment.id,`rejected:${payment.subject_id}`])
  if(!refund) throw new HTTPError({statusCode:409,statusMessage:outcome.ok?'Refund intent missing':'Booking rejection could not be committed'})
  return jsonResponse(await executeRefund(db,createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),payment,authorization.amount,`rejected:${payment.subject_id}`,'requested_by_customer',userId))
 }
 return jsonResponse(await refundPayment(db,createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),principal,body.authorization_id))
})
