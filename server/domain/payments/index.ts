import type Stripe from 'stripe'
import { HTTPError } from 'nitro'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { assertRoleAllows } from '~/server/utils/member-access'

export interface Payment {
  id: string
  organization_id: string
  buyer_user_id: string | null
  stripe_account_id: string
  livemode: number
  subject_type: 'booking' | 'order' | 'reservation' | 'invoice'
  subject_id: string | null
  location_id: string | null
  currency: string
  amount: number
  price_snapshot_json: string
  tax_amount: number
  captured_amount: number
  refunded_amount: number
  state: string
  stripe_payment_intent_id: string | null
  receipt_url: string | null
  created_at: string
  updated_at: string
}
export type FinancialAction = 'read' | 'create' | 'refund' | 'disputes' | 'payouts' | 'integration'
export interface FinancialPrincipal { organizationId: string; userId: string; role: string }
export async function authorizePayments(principal: FinancialPrincipal, action: FinancialAction): Promise<void> {
  await assertRoleAllows({ organizationId: principal.organizationId, role: principal.role, permissions: { payments: [action] } })
}
export function assertMinorAmount(amount: number, positive = true): void {
  if (!Number.isSafeInteger(amount) || amount < (positive ? 1 : 0)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Amount must be an integer in currency minor units' })
  }
}
export async function requirePayment(db: DbClient, organizationId: string, paymentId: string): Promise<Payment> {
  const payment = await queryFirst<Payment>(db, 'SELECT * FROM payments WHERE id = ? AND organization_id = ?', [paymentId, organizationId])
  if (!payment) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment not found' })
  return payment
}
export async function listPayments(db: DbClient, principal: FinancialPrincipal, input: { from: string; to: string; after?: string; limit?: number }) {
  await authorizePayments(principal, 'read')
  const from = new Date(input.from), to = new Date(input.to)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new HTTPError({ statusCode: 400, statusMessage: 'Valid UTC period is required' })
  const rows = await queryAll<Payment>(db, `SELECT * FROM payments WHERE organization_id = ? AND created_at >= ? AND created_at < ? AND id > ? ORDER BY id LIMIT ?`,
    [principal.organizationId, from.toISOString(), to.toISOString(), input.after ?? '', Math.min(input.limit ?? 50, 100) + 1])
  const limit = Math.min(input.limit ?? 50, 100)
  if (!Number.isInteger(limit) || limit < 1) throw new HTTPError({statusCode:400,statusMessage:'Page size must be a positive integer'})
  return { organization_id: principal.organizationId, timezone: 'UTC', from: from.toISOString(), to: to.toISOString(), payments: rows.slice(0, limit), next_cursor: rows.length > limit ? rows[limit - 1]!.id : null }
}
export async function paymentSummary(db: DbClient, principal: FinancialPrincipal, from: string, to: string) {
  await authorizePayments(principal, 'read')
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) throw new HTTPError({ statusCode: 400, statusMessage: 'Valid UTC period is required' })
  from = new Date(from).toISOString(); to = new Date(to).toISOString()
  const amounts = await queryAll(db, `SELECT currency, SUM(captured_amount) AS captured_amount, SUM(refunded_amount) AS refunded_amount,
    COALESCE((SELECT SUM(d.amount) FROM payment_disputes d JOIN payments p2 ON p2.id=d.payment_id WHERE p2.organization_id=p.organization_id AND d.currency=p.currency AND p2.created_at>=? AND p2.created_at<? AND d.status NOT IN ('won','warning_closed')),0) AS disputed_amount
    FROM payments p WHERE organization_id=? AND created_at>=? AND created_at<? GROUP BY currency`, [from,to,principal.organizationId,from,to])
  const usage = await queryAll(db, `SELECT currency, kind, SUM(amount) AS amount, SUM(CASE WHEN delivery_at IS NULL THEN 1 ELSE 0 END) AS pending_delivery FROM payment_usage_events WHERE organization_id=? AND provider_occurred_at>=? AND provider_occurred_at<? GROUP BY currency,kind`, [principal.organizationId,from,to])
  return { organization_id: principal.organizationId, timezone: 'UTC', from, to, amounts, usage, usage_rate_percent: '1.337', usage_status: 'Metronome rates captured volume; Stripe costs remain unreconciled until provider itemization arrives', source: 'Stripe authenticated projections', refreshed_at: new Date().toISOString() }
}

/** Only an authenticated browser approval may approve this request. MCP receives a handoff. */
export async function requestRefundAuthorization(db: DbClient, principal: FinancialPrincipal, paymentId: string, amount: number) {
  await authorizePayments(principal, 'refund')
  assertMinorAmount(amount)
  const payment = await requirePayment(db, principal.organizationId, paymentId)
  if (amount > payment.captured_amount - payment.refunded_amount) throw new HTTPError({ statusCode: 409, statusMessage: 'Amount exceeds refundable principal' })
  const id = crypto.randomUUID()
  await execute(db, `INSERT INTO payment_authorizations(id,organization_id,user_id,payment_id,action,amount,expires_at) VALUES(?,?,?,?,'refund',?,?)`, [id, principal.organizationId, principal.userId, paymentId, amount, new Date(Date.now()+10*60*1000).toISOString()])
  return { authorization_id: id, payment_id: paymentId, amount, currency: payment.currency, confirmation_required: true }
}
export async function approveRefundAuthorization(db: DbClient, principal: FinancialPrincipal, id: string) {
  await authorizePayments(principal, 'refund')
  const now = new Date().toISOString()
  const result = await execute(db, `UPDATE payment_authorizations SET approved_at=COALESCE(approved_at,?) WHERE id=? AND organization_id=? AND user_id=? AND action IN ('refund','reject_booking') AND expires_at>? AND consumed_at IS NULL`, [now,id,principal.organizationId,principal.userId,now])
  if (result.meta.changes !== 1) {
    const replay=await queryFirst(db,`SELECT a.id FROM payment_authorizations a WHERE a.id=? AND a.organization_id=? AND a.user_id=? AND a.approved_at IS NOT NULL AND a.consumed_at IS NOT NULL AND EXISTS(SELECT 1 FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.payment_id=a.payment_id AND (r.idempotency_key='approved:'||a.id OR (a.action='reject_booking' AND r.idempotency_key='rejected:'||p.subject_id)))`,[id,principal.organizationId,principal.userId])
    if(!replay)throw new HTTPError({statusCode:409,statusMessage:'Financial authorization expired or unavailable'})
  }
}
export async function refundPayment(db: DbClient, stripe: Stripe, principal: FinancialPrincipal, authorizationId: string) {
  await authorizePayments(principal, 'refund')
  // Expiry prevents a new financial instruction; an already-authorized durable intent still needs recovery.
  const authorization = await queryFirst<{payment_id:string;amount:number}>(db, `SELECT a.payment_id,a.amount FROM payment_authorizations a WHERE a.id=? AND a.organization_id=? AND a.user_id=? AND a.action='refund' AND a.approved_at IS NOT NULL AND (a.expires_at>? OR a.consumed_at IS NOT NULL OR EXISTS(SELECT 1 FROM payment_refunds r WHERE r.payment_id=a.payment_id AND r.idempotency_key='approved:'||a.id AND r.amount=a.amount AND r.created_by=a.user_id AND r.created_at>=a.approved_at AND r.created_at<=a.expires_at))`, [authorizationId,principal.organizationId,principal.userId,new Date().toISOString()])
  if (!authorization) throw new HTTPError({ statusCode: 403, statusMessage: 'Explicit browser financial approval is required' })
  return await executeRefund(db,stripe,await requirePayment(db,principal.organizationId,authorization.payment_id),authorization.amount,`approved:${authorizationId}`,'requested_by_customer',principal.userId)
}
/** Private financial boundary used by merchant approval and automatic unfulfillable capture recovery. */
export async function executeRefund(db: DbClient, stripe: Stripe, payment: Payment, amount: number, key: string, reason: Stripe.RefundCreateParams.Reason, actor: string | null) {
  assertMinorAmount(amount)
  if (!payment.stripe_payment_intent_id) throw new HTTPError({ statusCode: 409, statusMessage: 'Payment has no captured provider object' })
  const existing = await queryFirst<{id:string;stripe_refund_id:string|null;amount:number;attempted_at:string|null}>(db,'SELECT id,stripe_refund_id,amount,attempted_at FROM payment_refunds WHERE payment_id=? AND idempotency_key=?',[payment.id,key])
  if(existing && existing.amount!==amount) throw new HTTPError({statusCode:409,statusMessage:'Refund retry amount differs from durable intent'})
  if (existing?.stripe_refund_id) return await reconcileRefundState(db,stripe,payment,existing.stripe_refund_id)
  const now = new Date().toISOString(), id = existing?.id ?? crypto.randomUUID()
  if (!existing) {
    const result = await execute(db, `INSERT INTO payment_refunds(id,payment_id,idempotency_key,amount,reason,status,created_by,created_at,updated_at)
      SELECT ?,?,?,?,?, 'creating',?,?,? WHERE ? <= (SELECT captured_amount-refunded_amount-COALESCE((SELECT SUM(amount) FROM payment_refunds WHERE payment_id=? AND status IN ('queued','creating','pending','requires_action')),0) FROM payments WHERE id=?)`, [id,payment.id,key,amount,reason,actor,now,now,amount,payment.id,payment.id])
    if (result.meta.changes !== 1) throw new HTTPError({ statusCode: 409, statusMessage: 'Refund exceeds remaining principal' })
  }
  let refund:Stripe.Refund|undefined
  try {
    if(existing?.attempted_at){
      let after:string|undefined
      for(let page=0;page<100;page++){
        const list=await stripe.refunds.list({payment_intent:payment.stripe_payment_intent_id,limit:100,...(after?{starting_after:after}:{})},{stripeAccount:payment.stripe_account_id})
        const matches=list.data.filter(row=>row.metadata?.krabiclaw_refund_id===id)
        if(matches.length>1)throw new Error('Provider contains duplicate refunds for one durable intent')
        if(matches[0]){refund=matches[0];break}
        if(!list.has_more)break
        after=list.data.at(-1)?.id
        if(page===99)throw new Error('Native refund history requires bounded operator reconciliation')
      }
    }
    if(!refund){
      await execute(db,"UPDATE payment_refunds SET status='creating',attempted_at=COALESCE(attempted_at,?),updated_at=? WHERE id=?",[now,now,id])
      refund=await stripe.refunds.create({payment_intent:payment.stripe_payment_intent_id,amount,reason,metadata:{krabiclaw_refund_id:id}},{stripeAccount:payment.stripe_account_id,idempotencyKey:`krabiclaw-refund:${payment.id}:${key}`})
    }
  }catch(error){
    await execute(db,'UPDATE payment_refunds SET error=?,updated_at=? WHERE id=?',[error instanceof Error?error.message:String(error),new Date().toISOString(),id])
    throw error
  }
  if (refund.currency.toUpperCase() !== payment.currency || refund.amount !== amount) throw new Error('Stripe refund financial scope mismatch')
  await executeBatch(db,[
    {query:'UPDATE payment_refunds SET stripe_refund_id=?,status=?,error=NULL,updated_at=? WHERE id=?',params:[refund.id,refund.status,now,id]},
    {query:`UPDATE payments SET refunded_amount=(SELECT COALESCE(SUM(amount),0) FROM payment_refunds WHERE payment_id=? AND status='succeeded'),updated_at=? WHERE id=?`,params:[payment.id,now,payment.id]},
    {query:"UPDATE payments SET state=CASE WHEN refunded_amount=captured_amount AND captured_amount>0 THEN 'refunded' ELSE state END WHERE id=?",params:[payment.id]},
    {query:'UPDATE payment_authorizations SET consumed_at=? WHERE id=?',params:[now,key.replace(/^approved:/u,'')]},
  ])
  return {id,stripe_refund_id:refund.id,status:refund.status}
}

/** Native refund state is independent of booking and fulfillment state. */
export async function reconcileRefundState(db:DbClient,stripe:Stripe,payment:Payment,refundId:string) {
 const refund=await stripe.refunds.retrieve(refundId,{}, {stripeAccount:payment.stripe_account_id})
 const intentId=typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id
 if(refund.id!==refundId||refund.currency.toUpperCase()!==payment.currency||intentId!==payment.stripe_payment_intent_id)throw new Error('Native refund identity does not match payment')
 const matched=await queryFirst<{id:string;amount:number}>(db,'SELECT id,amount FROM payment_refunds WHERE payment_id=? AND (stripe_refund_id=? OR id=?)',[payment.id,refund.id,refund.metadata?.krabiclaw_refund_id??''])
 if(matched&&matched.amount!==refund.amount)throw new Error('Native refund amount changed from authorized intent')
 const id=matched?.id??crypto.randomUUID(),now=new Date().toISOString()
 await executeBatch(db,[
  {query:`INSERT INTO payment_refunds(id,payment_id,idempotency_key,stripe_refund_id,amount,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stripe_refund_id=excluded.stripe_refund_id,status=excluded.status,error=NULL,updated_at=excluded.updated_at`,params:[id,payment.id,`provider:${payment.stripe_account_id}:${payment.livemode}:${refund.id}`,refund.id,refund.amount,refund.reason??'provider',refund.status,now,now]},
  {query:"UPDATE payments SET refunded_amount=(SELECT COALESCE(SUM(amount),0) FROM payment_refunds WHERE payment_id=? AND status='succeeded'),updated_at=? WHERE id=?",params:[payment.id,now,payment.id]},
  {query:"UPDATE payments SET state=CASE WHEN refunded_amount=captured_amount AND captured_amount>0 THEN 'refunded' ELSE state END WHERE id=?",params:[payment.id]},
  {query:`UPDATE payment_authorizations SET consumed_at=COALESCE(consumed_at,?) WHERE payment_id=? AND approved_at IS NOT NULL AND action='refund' AND EXISTS(SELECT 1 FROM payment_refunds r WHERE r.id=? AND r.payment_id=payment_authorizations.payment_id AND r.idempotency_key='approved:'||payment_authorizations.id AND r.amount=payment_authorizations.amount AND r.created_by=payment_authorizations.user_id)`,params:[now,payment.id,id]},
 ])
 return {id,stripe_refund_id:refund.id,status:refund.status}
}
