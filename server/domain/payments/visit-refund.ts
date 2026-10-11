import {HTTPError} from 'nitro'
import {queryFirst,type BatchQuery,type DbClient} from '~/server/db'
import {authorizePayments,requestRefundAuthorization,type Payment} from './index'
import { isRecord } from '~/server/utils/type-guards'

/** Declining or cancelling a paid visit returns the whole payment, as Airbnb's host cancellation does. */
export type VisitRefundAction='reject'|'cancel'
export const visitRefundKey=(action:VisitRefundAction,subjectType:'booking'|'reservation',subjectId:string)=>`${action==='reject'?'rejected':subjectType==='reservation'?'cancelled-reservation':'cancelled'}:${subjectId}`

/** Extends the canonical visit operation's batch, never a second booking writer. */
export async function visitRefundQueries(db:DbClient,input:{action:VisitRefundAction;organizationId:string;actorUserId:string;subjectType:'booking'|'reservation';subjectId:string;authorizationId?:string;financialWritesAllowed?:boolean;note?:string;entryId:string;now:string}):Promise<{queries:BatchQuery[];guard:BatchQuery|null}> {
 const payment=await queryFirst<Payment>(db,'SELECT * FROM payments WHERE organization_id=? AND subject_type=? AND subject_id=? AND captured_amount>refunded_amount',[input.organizationId,input.subjectType,input.subjectId])
 if(!payment)return {queries:[],guard:null}
 if(input.financialWritesAllowed===false){
  const destination=await queryFirst<{slug:string;request_id:string|null}>(db,`SELECT o.slug,b.request_id FROM organization o JOIN ${input.subjectType==='booking'?'bookings':'reservations'} b ON b.organization_id=o.id WHERE o.id=? AND b.id=?`,[input.organizationId,input.subjectId])
  if(!destination?.slug||!destination.request_id)throw new HTTPError({statusCode:409,statusMessage:'Paid booking dashboard destination is unavailable'})
  throw new HTTPError({statusCode:409,statusMessage:`This paid visit requires a refund before ${input.action==='reject'?'rejection':'cancellation'} can complete. Open its dashboard details to review and approve the financial action. The booking has not changed.`,data:{code:'financial_action_required',dashboard_url:`/dashboard/${encodeURIComponent(destination.slug)}/bookings/${input.subjectType}/${encodeURIComponent(destination.request_id)}`}})
 }
 const member=await queryFirst<{role:string}>(db,'SELECT role FROM member WHERE organizationId=? AND userId=?',[input.organizationId,input.actorUserId])
 if(!member)throw new HTTPError({statusCode:403,statusMessage:'Financial organization membership required'})
 const principal={organizationId:input.organizationId,userId:input.actorUserId,role:member.role}
 await authorizePayments(principal,'refund')
 const amount=payment.captured_amount-payment.refunded_amount
 const authorizationAction=input.subjectType==='reservation'?'cancel_reservation':input.action==='reject'?'reject_booking':'cancel_booking'
 const approval=input.authorizationId?await queryFirst(db,"SELECT id FROM payment_authorizations WHERE id=? AND organization_id=? AND user_id=? AND payment_id=? AND action=? AND amount=? AND approved_at IS NOT NULL AND consumed_at IS NULL AND expires_at>?",[input.authorizationId,input.organizationId,input.actorUserId,payment.id,authorizationAction,amount,input.now]):null
 if(!approval){
  const org=await queryFirst<{slug:string}>(db,'SELECT slug FROM organization WHERE id=?',[input.organizationId])
  if(!org?.slug)throw new HTTPError({statusCode:409,statusMessage:'Refund approval dashboard destination is unavailable'})
  const prepared=await requestRefundAuthorization(db,principal,payment.id,amount,authorizationAction,input.note)
  throw new HTTPError({statusCode:409,statusMessage:`Paid ${input.action==='reject'?'rejection':'cancellation'} requires explicit approval of the full refund`,data:{financial_approval_url:`/dashboard/${encodeURIComponent(org.slug)}/earnings/refunds/approve?id=${prepared.authorization_id}`}})
 }
 const pending=await queryFirst(db,"SELECT id FROM payment_refunds WHERE payment_id=? AND status IN ('queued','creating','pending','requires_action')",[payment.id])
 if(pending)throw new HTTPError({statusCode:409,statusMessage:'A refund is already in progress; reconcile it before changing this booking'})
 const id=crypto.randomUUID(),key=visitRefundKey(input.action,input.subjectType,input.subjectId)
 const guard={query:`EXISTS(SELECT 1 FROM payments p JOIN payment_authorizations a ON a.payment_id=p.id WHERE p.id=? AND p.organization_id=? AND p.captured_amount-p.refunded_amount=? AND a.id=? AND a.user_id=? AND a.action=? AND a.approved_at IS NOT NULL AND a.consumed_at IS NULL AND a.expires_at>? AND NOT EXISTS(SELECT 1 FROM payment_refunds r WHERE r.payment_id=p.id AND r.status IN ('queued','creating','pending','requires_action')))`,params:[payment.id,input.organizationId,amount,input.authorizationId!,input.actorUserId,authorizationAction,input.now]}
 return {guard,queries:[
  {query:`INSERT INTO payment_refunds(id,payment_id,idempotency_key,amount,reason,note,status,created_by,created_at,updated_at) SELECT ?,?,?,?,'requested_by_customer',(SELECT note FROM payment_authorizations WHERE id=?),'queued',?,?,? WHERE EXISTS(SELECT 1 FROM activity_entries WHERE id=? AND event_name=?) AND EXISTS(SELECT 1 FROM payments WHERE id=? AND captured_amount-refunded_amount=?) ON CONFLICT(idempotency_key) DO NOTHING`,params:[id,payment.id,key,amount,input.authorizationId!,input.actorUserId,input.now,input.now,input.entryId,`${input.subjectType}.${input.action}`,payment.id,amount]},
  {query:'UPDATE payment_authorizations SET consumed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payment_refunds WHERE idempotency_key=?)',params:[input.now,input.authorizationId!,key]},
 ]}
}

/** The business's quoted deposit terms authorize this guest refund; cancellation always releases the table. */
export async function guestReservationRefundQueries(db: DbClient, input: {
 organizationId: string; reservationId: string; requestId: string; startsAt: string; now: string; buyerUserId?: string
}): Promise<{ queries: BatchQuery[]; guard: BatchQuery | null }> {
 const payment = await queryFirst<Payment>(db, "SELECT * FROM payments WHERE organization_id = ? AND subject_type = 'reservation' AND subject_id = ? AND captured_amount > refunded_amount", [input.organizationId, input.reservationId])
 if (!payment) return { queries: [], guard: null }
 const reservation = await queryFirst<{ policy_json: string | null }>(db, 'SELECT policy_json FROM reservations WHERE organization_id = ? AND id = ?', [input.organizationId, input.reservationId])
 const terms: unknown = reservation?.policy_json ? JSON.parse(reservation.policy_json) : null
 if (!isRecord(terms)) throw new Error('Paid reservation has no accepted cancellation terms')
 const cutoff = terms.free_cancellation_until_minutes
 if (cutoff !== null && (!Number.isSafeInteger(cutoff) || Number(cutoff) < 0)) throw new Error('Paid reservation cancellation cutoff is invalid')
 if (cutoff !== null && Date.parse(input.now) > Date.parse(input.startsAt) - Number(cutoff) * 60_000) return { queries: [], guard: null }
 const pending = await queryFirst<{ amount: number }>(db, "SELECT COALESCE(SUM(amount), 0) AS amount FROM payment_refunds WHERE payment_id = ? AND status IN ('queued','creating','pending','requires_action')", [payment.id])
 const amount = payment.captured_amount - payment.refunded_amount - Number(pending?.amount ?? 0)
 if (amount <= 0) return { queries: [], guard: null }
 const key = `guest-cancelled-reservation:${input.reservationId}`
 const guard: BatchQuery = {
  query: `EXISTS (SELECT 1 FROM payments p WHERE p.id = ? AND p.organization_id = ? AND p.captured_amount - p.refunded_amount -
    COALESCE((SELECT SUM(amount) FROM payment_refunds WHERE payment_id = p.id AND status IN ('queued','creating','pending','requires_action')), 0) = ?)`,
  params: [payment.id, input.organizationId, amount],
 }
 return { guard, queries: [{
  query: `INSERT INTO payment_refunds(id,payment_id,idempotency_key,amount,reason,status,created_by,created_at,updated_at)
    SELECT ?,?,?,?,'requested_by_customer','queued',?,?,? WHERE EXISTS (SELECT 1 FROM activity_entries WHERE request_id = ? AND dedupe_key = ?)
    ON CONFLICT(idempotency_key) DO NOTHING`,
  params: [crypto.randomUUID(), payment.id, key, amount, input.buyerUserId ?? null, input.now, input.now, input.requestId, `reservation:${input.reservationId}:guest-cancel`],
 }] }
}
