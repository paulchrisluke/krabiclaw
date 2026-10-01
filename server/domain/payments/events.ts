import type Stripe from 'stripe'
import { execute, executeBatch, queryFirst, type DbClient } from '~/server/db'
import { sessionClaimQuery } from '~/server/utils/availability'
import { processStripeWebhookEvent } from '~/server/utils/stripe-webhook-events'
import { executeRefund, reconcileRefundState, requirePayment, type Payment } from './index'

interface Hold {
  id:string; organization_id:string; product_id:string; variant_id:string; session_id:string
  buyer_user_id:string|null; request_id:string|null; quantity:number; status:string; expires_at:string; converted_booking_id:string|null
}
/** Provider retrieval, account/mode and frozen money checks precede every conversion. */
export async function reconcilePaymentIntent(db:DbClient,stripe:Stripe,payment:Payment,intent:Stripe.PaymentIntent) {
  if (intent.livemode !== Boolean(payment.livemode) || intent.currency.toUpperCase() !== payment.currency || intent.metadata.krabiclaw_payment_id !== payment.id || (payment.stripe_payment_intent_id && payment.stripe_payment_intent_id !== intent.id)) throw new Error('Stripe PaymentIntent financial identity mismatch')
  const attempt=await queryFirst<{stripe_checkout_id:string}>(db,'SELECT stripe_checkout_id FROM payment_attempts WHERE payment_id=? AND stripe_checkout_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',[payment.id])
  if(!attempt) throw new Error('PaymentIntent has no authorized checkout attempt')
  const checkout=await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_id,{expand:['line_items.data.price']},{stripeAccount:payment.stripe_account_id})
  const snapshot=JSON.parse(payment.price_snapshot_json) as {price:{unit_amount:number;currency:string};quantity:number}
  const line=checkout.line_items?.data[0]
  const checkoutIntentId=typeof checkout.payment_intent==='string'?checkout.payment_intent:checkout.payment_intent?.id
  if(checkoutIntentId!==intent.id)throw new Error('Captured intent is not the authorized Checkout payment')
  if(checkout.line_items?.data.length!==1 || line?.price?.unit_amount!==snapshot.price.unit_amount || line.quantity!==snapshot.quantity || line.price.currency.toUpperCase()!==payment.currency || checkout.client_reference_id!==payment.id || checkout.livemode!==Boolean(payment.livemode) || checkout.amount_total!==intent.amount || checkout.currency?.toUpperCase()!==payment.currency) throw new Error('Checkout frozen price or native tax total mismatch')
  const now = new Date().toISOString()
  if (intent.status !== 'succeeded') {
    if (intent.status === 'canceled') await executeBatch(db,[{query:"UPDATE payments SET state='failed',updated_at=? WHERE id=? AND captured_amount=0",params:[now,payment.id]},{query:"UPDATE payment_checkout_holds SET status='released' WHERE payment_id=? AND status='active'",params:[payment.id]}])
    return
  }
  if (intent.amount_received !== checkout.amount_total || intent.application_fee_amount) throw new Error('Captured principal or application fee violates financial contract')
  const chargeId=typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge?.id
  const charge=chargeId?await stripe.charges.retrieve(chargeId,{}, {stripeAccount:payment.stripe_account_id}):null
  if(!charge || charge.livemode!==Boolean(payment.livemode) || charge.payment_intent!==intent.id || charge.amount!==intent.amount_received) throw new Error('Captured charge financial scope mismatch')
  await executeBatch(db,[
    {query:'UPDATE payments SET stripe_charge_id=?,receipt_url=? WHERE id=?',params:[charge.id,charge.receipt_url,payment.id]},
    {query:"UPDATE payments SET stripe_payment_intent_id=?,captured_amount=?,tax_amount=?,state=CASE WHEN state IN ('refunded','recovery') THEN state ELSE 'captured' END,updated_at=? WHERE id=? AND organization_id=?",params:[intent.id,intent.amount_received,checkout.total_details?.amount_tax??0,now,payment.id,payment.organization_id]},
    {query:"INSERT OR IGNORE INTO payment_usage_events(id,organization_id,payment_id,kind,currency,amount,source_id,provider_occurred_at,created_at) VALUES(?,?,?,'captured_volume',?,?,?,?,?)",params:[crypto.randomUUID(),payment.organization_id,payment.id,payment.currency,intent.amount_received,`capture:${payment.stripe_account_id}:${payment.livemode}:${intent.id}`,new Date(charge.created*1000).toISOString(),now]},
  ],{operation:'Record authenticated capture and usage'})
  if (payment.subject_type !== 'booking') return
  const hold = await queryFirst<Hold>(db,'SELECT * FROM payment_checkout_holds WHERE payment_id=? AND organization_id=?',[payment.id,payment.organization_id])
  if (!hold) throw new Error('Captured booking payment has no durable hold')
  if (hold.status === 'converted') return
  const bookingId = crypto.randomUUID()
  const claim = sessionClaimQuery({bookingId,organizationId:hold.organization_id,productId:hold.product_id,sessionId:hold.session_id,productVariantId:hold.variant_id,partySize:hold.quantity,userId:hold.buyer_user_id,requestId:hold.request_id,now,capturedPaymentId:payment.id})
  const results = await executeBatch(db,[claim,
    {query:"UPDATE payment_checkout_holds SET status='converted',converted_booking_id=? WHERE id=? AND status='active' AND EXISTS(SELECT 1 FROM bookings WHERE id=?)",params:[bookingId,hold.id,bookingId]},
    {query:`INSERT INTO activity_entries(id,request_id,kind,scope_kind,actor_kind,event_name,payload_json,dedupe_key,sequence,occurred_at,created_at) SELECT ?,b.request_id,'operation','request','system','booking.created',json_object('operational_booking_id',b.id,'request_id',b.request_id,'afterStatus',b.status,'payment_id',?,'intent','booking.created'),?,COALESCE((SELECT MAX(sequence) FROM activity_entries WHERE request_id=b.request_id),0)+1,?,? FROM bookings b WHERE b.id=? AND b.request_id IS NOT NULL ON CONFLICT(dedupe_key) DO NOTHING`,params:[crypto.randomUUID(),payment.id,`booking:${bookingId}:created`,now,now,bookingId]},
    {query:'UPDATE payments SET subject_id=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=?)',params:[bookingId,now,payment.id,bookingId]},
    {query: "UPDATE requests SET conversation_state='needs_attention',payload_json=json_set(payload_json,'$.payment.state','captured'),updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=?)",params:[now,hold.request_id,bookingId]},
  ],{operation:'Convert captured checkout hold'})
  if (results[0]?.meta.changes === 1) return
  // Replays/races can observe another worker's conversion after this worker read.
  const converted = await queryFirst<Hold>(db,'SELECT * FROM payment_checkout_holds WHERE id=?',[hold.id])
  if (converted?.status === 'converted') return
  await executeBatch(db,[{query:"UPDATE payment_checkout_holds SET status='released' WHERE id=? AND status='active'",params:[hold.id]},{query:"UPDATE payments SET state='recovery',updated_at=? WHERE id=?",params:[now,payment.id]}])
  await executeRefund(db,stripe,await requirePayment(db,payment.organization_id,payment.id),intent.amount_received,`unfulfillable:${intent.id}`,'requested_by_customer',null)
}

export function paymentEventKey(event:Pick<Stripe.Event,'id'|'account'|'livemode'>):string{return `payments:${event.account??'unscoped'}:${Number(event.livemode)}:${event.id}`}
export async function processPaymentEvent(db:DbClient,stripe:Stripe,event:Stripe.Event,_payload:string) {
  if(!['checkout.session.','payment_intent.','refund.','charge.dispute.'].some(prefix=>event.type.startsWith(prefix)))return true
  const object=event.data.object as {id?:string;metadata?:Record<string,string>|null}
  const payload=JSON.stringify({id:event.id,type:event.type,account:event.account,livemode:event.livemode,data:{object:{id:object.id,metadata:{krabiclaw_payment_id:object.metadata?.krabiclaw_payment_id}}}})
  return await processStripeWebhookEvent(db,{id:paymentEventKey(event),type:event.type,payload,processor:'tenant_payments'},async()=>{
    if (!event.account) throw new Error('Tenant payment event requires connected account context')
    const connected = await queryFirst<{organization_id:string;livemode:number}>(db,'SELECT organization_id,livemode FROM stripe_connected_accounts WHERE stripe_account_id=? AND livemode=? UNION ALL SELECT organization_id,livemode FROM payment_servicing_tenants WHERE stripe_account_id=? AND livemode=? LIMIT 1',[event.account,Number(event.livemode),event.account,Number(event.livemode)])
    if (!connected) return
    if (Boolean(connected.livemode) !== event.livemode) throw new Error('Stripe connected event mode mismatch')
    if (event.type.startsWith('checkout.session.')) {
      const object = event.data.object as Stripe.Checkout.Session
      const attempt = await queryFirst<{payment_id:string}>(db,`SELECT a.payment_id FROM payment_attempts a JOIN payments p ON p.id=a.payment_id WHERE a.stripe_checkout_id=? AND p.stripe_account_id=? AND p.livemode=?`,[object.id,event.account,Number(event.livemode)])
      if (!attempt) return
      const checkout = await stripe.checkout.sessions.retrieve(object.id,{}, {stripeAccount:event.account})
      const payment = await requirePayment(db,connected.organization_id,attempt.payment_id)
      if (checkout.client_reference_id !== payment.id || checkout.livemode !== event.livemode || checkout.currency?.toUpperCase() !== payment.currency) throw new Error('Stripe checkout snapshot mismatch')
      if (checkout.payment_status === 'paid' && checkout.payment_intent) {
        const intentId = typeof checkout.payment_intent==='string'?checkout.payment_intent:checkout.payment_intent.id
        await reconcilePaymentIntent(db,stripe,payment,await stripe.paymentIntents.retrieve(intentId,{}, {stripeAccount:event.account}))
      } else if (checkout.status === 'expired') await executeBatch(db,[{query:"UPDATE payment_checkout_holds SET status='released' WHERE payment_id=? AND status='active'",params:[payment.id]},{query:"UPDATE payment_attempts SET status='expired',updated_at=? WHERE stripe_checkout_id=?",params:[new Date().toISOString(),checkout.id]}])
      return
    }
    if (event.type.startsWith('payment_intent.')) {
      const object = event.data.object as Stripe.PaymentIntent
      const id = object.metadata.krabiclaw_payment_id
      if (!id) return
      const payment = await requirePayment(db,connected.organization_id,id)
      if (payment.stripe_account_id!==event.account || Boolean(payment.livemode)!==event.livemode) throw new Error('Payment event account mismatch')
      await reconcilePaymentIntent(db,stripe,payment,await stripe.paymentIntents.retrieve(object.id,{}, {stripeAccount:event.account}))
      return
    }
    if (event.type.startsWith('refund.')) {
      const object = event.data.object as Stripe.Refund
      const refund = await stripe.refunds.retrieve(object.id,{}, {stripeAccount:event.account})
      const intentId = typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id
      const payment = await queryFirst<Payment>(db,'SELECT * FROM payments WHERE stripe_account_id=? AND livemode=? AND stripe_payment_intent_id=?',[event.account,Number(event.livemode),intentId])
      if (!payment) return
      await reconcileRefundState(db,stripe,payment,refund.id)
      return
    }
    if (event.type.startsWith('charge.dispute.')) {
      const object=event.data.object as Stripe.Dispute
      const dispute=await stripe.disputes.retrieve(object.id,{}, {stripeAccount:event.account})
      const intentId=typeof dispute.payment_intent==='string'?dispute.payment_intent:dispute.payment_intent?.id
      const payment=await queryFirst<Payment>(db,'SELECT * FROM payments WHERE stripe_account_id=? AND livemode=? AND stripe_payment_intent_id=?',[event.account,Number(event.livemode),intentId])
      if (!payment) return
      await reconcileDisputeState(db,payment,dispute)
    }
  })
}

export async function reconcileDisputeState(db:DbClient,payment:Payment,dispute:Stripe.Dispute) {
 const intentId=typeof dispute.payment_intent==='string'?dispute.payment_intent:dispute.payment_intent?.id
 if(dispute.currency.toUpperCase()!==payment.currency||intentId!==payment.stripe_payment_intent_id)throw new Error('Dispute native financial identity mismatch')
 await execute(db,`INSERT INTO payment_disputes(id,payment_id,stripe_dispute_id,amount,currency,reason,status,evidence_due_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(payment_id,stripe_dispute_id) DO UPDATE SET status=excluded.status,evidence_due_at=excluded.evidence_due_at,updated_at=excluded.updated_at`,[crypto.randomUUID(),payment.id,dispute.id,dispute.amount,payment.currency,dispute.reason,dispute.status,dispute.evidence_details.due_by?new Date(dispute.evidence_details.due_by*1000).toISOString():null,new Date().toISOString()])
}
