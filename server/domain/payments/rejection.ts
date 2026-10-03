import {HTTPError} from 'nitro'
import {queryFirst,type BatchQuery,type DbClient} from '~/server/db'
import {authorizePayments,requestRefundAuthorization,type Payment} from './index'
/** Extends the canonical booking operation's batch, never a second booking writer. */
export async function rejectedBookingRefundQueries(db:DbClient,input:{organizationId:string;actorUserId:string;bookingId:string;authorizationId?:string;entryId:string;now:string}):Promise<{queries:BatchQuery[];guard:BatchQuery|null}> {
 const payment=await queryFirst<Payment>(db,"SELECT * FROM payments WHERE organization_id=? AND subject_type='booking' AND subject_id=? AND captured_amount>refunded_amount",[input.organizationId,input.bookingId])
 if(!payment)return {queries:[],guard:null}
 const member=await queryFirst<{role:string}>(db,'SELECT role FROM member WHERE organizationId=? AND userId=?',[input.organizationId,input.actorUserId])
 if(!member)throw new HTTPError({statusCode:403,statusMessage:'Financial organization membership required'})
 const principal={organizationId:input.organizationId,userId:input.actorUserId,role:member.role}
 await authorizePayments(principal,'refund')
 const amount=payment.captured_amount-payment.refunded_amount
 const approval=input.authorizationId?await queryFirst(db,"SELECT id FROM payment_authorizations WHERE id=? AND organization_id=? AND user_id=? AND payment_id=? AND action='reject_booking' AND amount=? AND approved_at IS NOT NULL AND consumed_at IS NULL AND expires_at>?",[input.authorizationId,input.organizationId,input.actorUserId,payment.id,amount,input.now]):null
 if(!approval){
  const prepared=await requestRefundAuthorization(db,principal,payment.id,amount,'reject_booking')
  const org=await queryFirst<{slug:string}>(db,'SELECT slug FROM organization WHERE id=?',[input.organizationId])
  throw new HTTPError({statusCode:409,statusMessage:'Paid rejection requires explicit approval of the full principal refund',data:{financial_approval_url:`/dashboard/${encodeURIComponent(org!.slug)}/payments/refunds/approve?id=${prepared.authorization_id}`}})
 }
 const pending=await queryFirst(db,"SELECT id FROM payment_refunds WHERE payment_id=? AND status IN ('queued','creating','pending','requires_action')",[payment.id])
 if(pending)throw new HTTPError({statusCode:409,statusMessage:'A refund is already in progress; reconcile it before rejecting'})
 const id=crypto.randomUUID(),key=`rejected:${input.bookingId}`
 const guard={query:`EXISTS(SELECT 1 FROM payments p JOIN payment_authorizations a ON a.payment_id=p.id WHERE p.id=? AND p.organization_id=? AND p.captured_amount-p.refunded_amount=? AND a.id=? AND a.user_id=? AND a.action='reject_booking' AND a.approved_at IS NOT NULL AND a.consumed_at IS NULL AND a.expires_at>? AND NOT EXISTS(SELECT 1 FROM payment_refunds r WHERE r.payment_id=p.id AND r.status IN ('queued','creating','pending','requires_action')))`,params:[payment.id,input.organizationId,amount,input.authorizationId!,input.actorUserId,input.now]}
 return {guard,queries:[
  {query:`INSERT INTO payment_refunds(id,payment_id,idempotency_key,amount,reason,status,created_by,created_at,updated_at) SELECT ?,?,?,?,'requested_by_customer','queued',?,?,? WHERE EXISTS(SELECT 1 FROM activity_entries WHERE id=? AND event_name='booking.reject') AND EXISTS(SELECT 1 FROM payments WHERE id=? AND captured_amount-refunded_amount=?) ON CONFLICT(idempotency_key) DO NOTHING`,params:[id,payment.id,key,amount,input.actorUserId,input.now,input.now,input.entryId,payment.id,amount]},
  {query:'UPDATE payment_authorizations SET consumed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payment_refunds WHERE idempotency_key=?)',params:[input.now,input.authorizationId!,key]},
 ]}
}
