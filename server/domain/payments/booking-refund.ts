import {HTTPError} from 'nitro'
import {queryFirst,type BatchQuery,type DbClient} from '~/server/db'
import {authorizePayments,requestRefundAuthorization,type Payment} from './index'

/** Declining or cancelling a paid booking returns the whole payment, as Airbnb's host cancellation does. */
export type BookingRefundAction='reject'|'cancel'
export const BOOKING_REFUND_AUTHORIZATION={reject:'reject_booking',cancel:'cancel_booking'} as const
export const bookingRefundKey=(action:BookingRefundAction,bookingId:string)=>`${action==='reject'?'rejected':'cancelled'}:${bookingId}`

/** Extends the canonical booking operation's batch, never a second booking writer. */
export async function bookingRefundQueries(db:DbClient,input:{action:BookingRefundAction;organizationId:string;actorUserId:string;bookingId:string;authorizationId?:string;note?:string;entryId:string;now:string}):Promise<{queries:BatchQuery[];guard:BatchQuery|null}> {
 const payment=await queryFirst<Payment>(db,"SELECT * FROM payments WHERE organization_id=? AND subject_type='booking' AND subject_id=? AND captured_amount>refunded_amount",[input.organizationId,input.bookingId])
 if(!payment)return {queries:[],guard:null}
 const member=await queryFirst<{role:string}>(db,'SELECT role FROM member WHERE organizationId=? AND userId=?',[input.organizationId,input.actorUserId])
 if(!member)throw new HTTPError({statusCode:403,statusMessage:'Financial organization membership required'})
 const principal={organizationId:input.organizationId,userId:input.actorUserId,role:member.role}
 await authorizePayments(principal,'refund')
 const amount=payment.captured_amount-payment.refunded_amount
 const authorizationAction=BOOKING_REFUND_AUTHORIZATION[input.action]
 const approval=input.authorizationId?await queryFirst(db,"SELECT id FROM payment_authorizations WHERE id=? AND organization_id=? AND user_id=? AND payment_id=? AND action=? AND amount=? AND approved_at IS NOT NULL AND consumed_at IS NULL AND expires_at>?",[input.authorizationId,input.organizationId,input.actorUserId,payment.id,authorizationAction,amount,input.now]):null
 if(!approval){
  const prepared=await requestRefundAuthorization(db,principal,payment.id,amount,authorizationAction,input.note)
  const org=await queryFirst<{slug:string}>(db,'SELECT slug FROM organization WHERE id=?',[input.organizationId])
  throw new HTTPError({statusCode:409,statusMessage:`Paid ${input.action==='reject'?'rejection':'cancellation'} requires explicit approval of the full refund`,data:{financial_approval_url:`/dashboard/${encodeURIComponent(org!.slug)}/earnings/refunds/approve?id=${prepared.authorization_id}`}})
 }
 const pending=await queryFirst(db,"SELECT id FROM payment_refunds WHERE payment_id=? AND status IN ('queued','creating','pending','requires_action')",[payment.id])
 if(pending)throw new HTTPError({statusCode:409,statusMessage:'A refund is already in progress; reconcile it before changing this booking'})
 const id=crypto.randomUUID(),key=bookingRefundKey(input.action,input.bookingId)
 const guard={query:`EXISTS(SELECT 1 FROM payments p JOIN payment_authorizations a ON a.payment_id=p.id WHERE p.id=? AND p.organization_id=? AND p.captured_amount-p.refunded_amount=? AND a.id=? AND a.user_id=? AND a.action=? AND a.approved_at IS NOT NULL AND a.consumed_at IS NULL AND a.expires_at>? AND NOT EXISTS(SELECT 1 FROM payment_refunds r WHERE r.payment_id=p.id AND r.status IN ('queued','creating','pending','requires_action')))`,params:[payment.id,input.organizationId,amount,input.authorizationId!,input.actorUserId,authorizationAction,input.now]}
 return {guard,queries:[
  {query:`INSERT INTO payment_refunds(id,payment_id,idempotency_key,amount,reason,note,status,created_by,created_at,updated_at) SELECT ?,?,?,?,'requested_by_customer',(SELECT note FROM payment_authorizations WHERE id=?),'queued',?,?,? WHERE EXISTS(SELECT 1 FROM activity_entries WHERE id=? AND event_name=?) AND EXISTS(SELECT 1 FROM payments WHERE id=? AND captured_amount-refunded_amount=?) ON CONFLICT(idempotency_key) DO NOTHING`,params:[id,payment.id,key,amount,input.authorizationId!,input.actorUserId,input.now,input.now,input.entryId,`booking.${input.action}`,payment.id,amount]},
  {query:'UPDATE payment_authorizations SET consumed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payment_refunds WHERE idempotency_key=?)',params:[input.now,input.authorizationId!,key]},
 ]}
}
