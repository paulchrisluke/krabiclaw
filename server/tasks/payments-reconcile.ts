import {execute,queryAll,queryFirst,type DbClient} from '~/server/db'
import {createStripeClient} from '~/server/utils/stripe-client'
import {hasOrganizationEntitlement} from '~/server/utils/billing'
import {stripeLivemodeFromKey} from '~/server/utils/stripe-connect'
import {defineScheduledTask} from '~/server/utils/scheduled-task'
import type {CloudflareEnv} from '~/server/utils/auth'
import {executeRefund,reconcileRefundState,requirePayment,type Payment} from '~/server/domain/payments'
import {reconcilePaymentIntent,reconcileDisputeState} from '~/server/domain/payments/events'
import {deliverPaymentsUsage} from '~/server/domain/payments/usage'
import {reconcileStripeCosts} from '~/server/domain/payments/costs'
export default defineScheduledTask<{skipped?:string;attempts?:number;refunds?:number;billingAccounts?:number}>({meta:{name:'payments:reconcile',description:'Reconcile Stripe payment attempts, durable refunds, attributable costs and Metronome usage'},async run({context}){
 const env=(context as {cloudflare?:{env?:CloudflareEnv}})?.cloudflare?.env
 if(!env?.DB)throw new Error('Payments reconciliation requires DB')
 if(!env.STRIPE_SECRET_KEY)return {result:{skipped:'Stripe is not configured'}}
 const db=env.DB as DbClient,stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments'),errors:Error[]=[]
 const now=new Date().toISOString()
 await execute(db,"UPDATE payment_checkout_holds SET status='released' WHERE status='active' AND expires_at<=?",[now])
 const attempts=await queryAll<Payment & {stripe_checkout_id:string}>(db,`SELECT p.*,a.stripe_checkout_id FROM payment_attempts a JOIN payments p ON p.id=a.payment_id WHERE a.stripe_checkout_id IS NOT NULL AND a.status IN ('open','creating') ORDER BY a.updated_at LIMIT 50`)
 for(const payment of attempts){try{
  const checkout=await stripe.checkout.sessions.retrieve(payment.stripe_checkout_id,{}, {stripeAccount:payment.stripe_account_id})
  if(checkout.livemode!==Boolean(payment.livemode) || checkout.client_reference_id!==payment.id)throw new Error('Reconciliation checkout financial scope mismatch')
  if(checkout.payment_status==='paid'&&checkout.payment_intent){const id=typeof checkout.payment_intent==='string'?checkout.payment_intent:checkout.payment_intent.id;await reconcilePaymentIntent(db,stripe,payment,await stripe.paymentIntents.retrieve(id,{}, {stripeAccount:payment.stripe_account_id}));await execute(db,"UPDATE payment_attempts SET status='completed',updated_at=? WHERE payment_id=?",[now,payment.id])}
  else if(checkout.status==='expired')await execute(db,"UPDATE payment_attempts SET status='expired',updated_at=? WHERE payment_id=?",[now,payment.id])
 }catch(error){errors.push(error instanceof Error?error:new Error(String(error)));await execute(db,'UPDATE payment_attempts SET error=?,updated_at=? WHERE payment_id=?',[String(error),now,payment.id])}}
 const refunds=await queryAll<{payment_id:string;organization_id:string;amount:number;idempotency_key:string;created_by:string|null}>(db,"SELECT r.*,p.organization_id FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.status IN ('queued','creating') ORDER BY r.updated_at LIMIT 50")
 for(const refund of refunds){try{await executeRefund(db,stripe,await requirePayment(db,refund.organization_id,refund.payment_id),refund.amount,refund.idempotency_key,'requested_by_customer',refund.created_by)}catch(error){errors.push(error instanceof Error?error:new Error(String(error)))}}
 const unresolved=await queryAll<Payment & {stripe_refund_id:string}>(db,"SELECT p.*,r.stripe_refund_id FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE r.stripe_refund_id IS NOT NULL AND r.status IN ('pending','requires_action') ORDER BY r.updated_at LIMIT 50")
 for(const payment of unresolved){try{await reconcileRefundState(db,stripe,payment,payment.stripe_refund_id)}catch(error){errors.push(error instanceof Error?error:new Error(String(error)))}}
 // Recover an authenticated provider Checkout if creation succeeded before D1
 // received its ID. Listing is read-only; it does not repeat expired writes.
 const interrupted=await queryAll<Payment & {attempt_id:string;expires_at:string}>(db,"SELECT p.*,a.id AS attempt_id,a.expires_at FROM payment_attempts a JOIN payments p ON p.id=a.payment_id WHERE a.stripe_checkout_id IS NULL AND a.status='creating' ORDER BY a.updated_at LIMIT 20")
 for(const payment of interrupted){try{
  let after:string|undefined,found:import('stripe').default.Checkout.Session|undefined
  for(let page=0;page<100;page++){
   const list=await stripe.checkout.sessions.list({limit:100,created:{gte:Math.floor(Date.parse(payment.created_at)/1000)-1,lte:Math.ceil(Date.parse(payment.expires_at)/1000)},...(after?{starting_after:after}:{})},{stripeAccount:payment.stripe_account_id})
   for(const checkout of list.data){if(checkout.client_reference_id!==payment.id||checkout.metadata?.krabiclaw_payment_id!==payment.id)continue;if(found||checkout.livemode!==Boolean(payment.livemode))throw new Error('Interrupted Checkout has ambiguous provider scope');found=checkout}
   if(!list.has_more)break
   after=list.data.at(-1)?.id
   if(page===99)throw new Error('Interrupted Checkout requires bounded provider review')
  }
  if(found)await execute(db,"UPDATE payment_attempts SET stripe_checkout_id=?,checkout_url=?,status='open',error=NULL,updated_at=? WHERE id=?",[found.id,found.url,now,payment.attempt_id])
  else if(payment.expires_at<=now)await execute(db,"UPDATE payment_attempts SET status='expired',updated_at=? WHERE id=?",[now,payment.attempt_id])
 }catch(error){errors.push(error instanceof Error?error:new Error(String(error)));await execute(db,'UPDATE payment_attempts SET error=?,updated_at=? WHERE id=?',[String(error),now,payment.attempt_id])}}
 // Rotate historical captures as well as open attempts so missed native
 // refund/dispute events converge without copying Stripe's balance ledger.
 const settled=await queryAll<Payment>(db,"SELECT * FROM payments WHERE captured_amount>0 AND stripe_payment_intent_id IS NOT NULL ORDER BY updated_at LIMIT 25")
 for(const payment of settled){try{
  const options={stripeAccount:payment.stripe_account_id},id=payment.stripe_payment_intent_id!
  await reconcilePaymentIntent(db,stripe,payment,await stripe.paymentIntents.retrieve(id,{},options))
  const [nativeRefunds,nativeDisputes]=await Promise.all([stripe.refunds.list({payment_intent:id,limit:100},options),stripe.disputes.list({payment_intent:id,limit:100},options)])
  if(nativeRefunds.has_more||nativeDisputes.has_more)throw new Error('Historical payment provider history requires bounded operator review')
  for(const refund of nativeRefunds.data)await reconcileRefundState(db,stripe,payment,refund.id)
  for(const dispute of nativeDisputes.data)await reconcileDisputeState(db,payment,dispute)
 }catch(error){errors.push(error instanceof Error?error:new Error(String(error)))}}
 const active=await queryFirst(db,'SELECT id FROM payments LIMIT 1')
 if(active){try{await reconcileStripeCosts(db,stripe,stripeLivemodeFromKey(env.STRIPE_SECRET_KEY),env.STRIPE_SECRET_KEY)}catch(error){errors.push(error instanceof Error?error:new Error(String(error)))}}
 const accounts=await queryAll<{organization_id:string}>(db,'SELECT organization_id FROM payment_billing_accounts')
 for(const account of accounts){try{if(!await hasOrganizationEntitlement(env,account.organization_id,'payments'))await execute(db,"UPDATE payment_billing_accounts SET status='servicing',updated_at=? WHERE organization_id=? AND status='active'",[now,account.organization_id]);await deliverPaymentsUsage(db,env,account.organization_id)}catch(error){errors.push(error instanceof Error?error:new Error(String(error)))}}
 if(errors.length)throw new AggregateError(errors,'Payments reconciliation has unresolved provider failures')
 return {result:{attempts:attempts.length,refunds:refunds.length,billingAccounts:accounts.length}}
}})
