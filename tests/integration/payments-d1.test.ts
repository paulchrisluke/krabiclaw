import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import {Miniflare} from 'miniflare'
import {generateSQLiteDrizzleJson,generateSQLiteMigration} from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import {sessionAllocationPredicate,claimSessionCapacity} from '../../server/utils/availability.ts'
import {executeGuestThreadOperation} from '../../server/domain/guest-threads/operations.ts'
import {requestBookingChange} from '../../server/domain/guest-threads/booking-changes.ts'
import {getGuestRequest,requestInsertQueries,threadPayloadForGuest} from '../../server/domain/requests.ts'
import {approveRefundAuthorization,executeRefund,requirePayment,requestRefundAuthorization,refundPayment,reconcileRefundState} from '../../server/domain/payments/index.ts'
import {processPaymentEvent,paymentEventKey,reconcilePaymentIntent} from '../../server/domain/payments/events.ts'
import {ingestStripeFeeReport,stripeFeeMinor} from '../../server/domain/payments/costs.ts'
import {metronomeCurrencyAmount,finalizePaymentsBilling,deliverPaymentsUsage,reconcileNativeBillingCredit} from '../../server/domain/payments/usage.ts'
import {createPurchaseClaim,claimPurchase} from '../../server/domain/payments/buyer.ts'
import {mcpFinancialApprovalErrorResult} from '../../server/utils/mcp-financial-handoff.ts'
const ORG='payments-org',NOW='2026-10-01T00:00:00.000Z'
async function boot(){
 const runtime=new Miniflare({workers:[{config:{name:'payments-proof',type:'worker',compatibilityDate:'2024-11-01',manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}},env:{DB:{type:'d1'}}}}]})
 const db=await runtime.getD1Database('DB')
 try {
 const migration=await generateSQLiteMigration(await generateSQLiteDrizzleJson({}),await generateSQLiteDrizzleJson(schema))
 await db.batch(migration.map(query=>db.prepare(query)))
 await db.prepare(`INSERT INTO organization(id,name,slug,subdomain,settings_json,theme_id,default_currency,status,onboarding_status,url_structure,vertical,updated_at) VALUES(?,'Payments','payments','payments','{"config":{"default_timezone":"America/New_York"}}','theme','USD','active','complete','flat','experience',?)`).bind(ORG,NOW).run()
 for(const id of ['guest','verified','other'])await db.prepare("INSERT INTO user(id,name,email,emailVerified) VALUES(?,?,?,1)").bind(id,id,`${id}@example.com`).run()
 await db.prepare("INSERT INTO products(id,organization_id,name,slug,created_by,updated_by) VALUES('product',?,'Consultation','consultation','guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by) VALUES('variant',?,'product','Hour','guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,duration_minutes,default_capacity,confirmation_mode,online_timezone,calendar_group,online_payment_required,created_by,updated_by) VALUES('product',?,60,1,'review','America/New_York','online',1,'guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES('session',?,'product','America/New_York','2099-10-01T13:00:00.000Z','2099-10-01T14:00:00.000Z',1,'scheduled','guest','guest')").bind(ORG).run()
 return {db,runtime}
 }catch(error){await runtime.dispose();throw error}
}
async function payable(db:D1Database,id:string,expires='2099-09-30T00:00:00.000Z'){
 await db.prepare("INSERT INTO payments(id,organization_id,buyer_user_id,stripe_account_id,livemode,subject_type,currency,amount,price_snapshot_json,created_at,updated_at) VALUES(?,?,'guest','acct_seller',0,'booking','USD',10000,?,?,?)").bind(id,ORG,JSON.stringify({price:{unit_amount:10000,currency:'USD'},quantity:1}),NOW,NOW).run()
 await db.prepare("INSERT INTO payment_attempts(id,payment_id,idempotency_key,stripe_checkout_id,return_token,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,'test-return-proof','open',?,?,?)").bind(`a:${id}`,id,`checkout:${id}`,`cs:${id}`,expires,NOW,NOW).run()
 await db.prepare("INSERT INTO payment_checkout_holds(id,organization_id,product_id,variant_id,price_id,session_id,buyer_user_id,payment_id,quantity,amount,currency,calendar_group,starts_at,ends_at,status,expires_at,created_at) VALUES(?,?,'product','variant','price','session','guest',?,1,10000,'USD','online','2099-10-01T13:00:00.000Z','2099-10-01T14:00:00.000Z','active',?,?)").bind(`h:${id}`,ORG,id,expires,NOW).run()
}
/** Deterministic provider boundary double. These tests do not claim Stripe sandbox success. */
function provider(id:string, loseRefundResponse=false){let refunds=0;const nativeRefunds=new Map<string,Record<string,unknown>>()
 const intent={id:`pi:${id}`,livemode:false,currency:'usd',metadata:{krabiclaw_payment_id:id},amount:10000,amount_received:10000,status:'succeeded',application_fee_amount:0,created:1790812800,latest_charge:`ch:${id}`} as unknown as Stripe.PaymentIntent
 const stripe={checkout:{sessions:{retrieve:async()=>({id:`cs:${id}`,client_reference_id:id,payment_intent:`pi:${id}`,livemode:false,currency:'usd',amount_total:10000,total_details:{amount_tax:0},line_items:{data:[{quantity:1,price:{unit_amount:10000,currency:'usd'}}]}})}},charges:{retrieve:async()=>({id:`ch:${id}`,livemode:false,payment_intent:`pi:${id}`,amount:10000,created:1790812800,receipt_url:'https://pay.stripe.com/test-receipt'})},refunds:{list:async()=>({data:[...nativeRefunds.values()],has_more:false}),retrieve:async(refundId:string)=>{const refund=nativeRefunds.get(refundId);if(!refund)throw new Error('Native refund not found');return refund},create:async(input:{amount:number;metadata?:Record<string,string>})=>{refunds++;const refund={id:`re:${id}:${refunds}`,payment_intent:`pi:${id}`,currency:'usd',amount:input.amount,status:'succeeded',metadata:input.metadata};nativeRefunds.set(refund.id,refund);if(loseRefundResponse)throw new Error('Native refund succeeded but its response was lost');return refund}}} as unknown as Stripe
 return {stripe,intent,refunds:()=>refunds}
}
test('active checkout holds exclude ordinary claims; authenticated capture converts once into durable review', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'p1')
  const predicate=sessionAllocationPredicate({organizationId:ORG,productId:'product',sessionId:'session',partySize:1,now:NOW})
  assert.equal(await db.prepare(`SELECT ${predicate.query} AS allowed`).bind(...predicate.params!).first('allowed'),0)
  await assert.rejects(()=>claimSessionCapacity(db,{organizationId:ORG,productId:'product',sessionId:'session',productVariantId:'variant',partySize:1}))
  const {stripe,intent}=provider('p1')
  await Promise.all([reconcilePaymentIntent(db,stripe,await requirePayment(db,ORG,'p1'),intent),reconcilePaymentIntent(db,stripe,await requirePayment(db,ORG,'p1'),intent)])
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),1)
  assert.equal(await db.prepare('SELECT status FROM bookings').first('status'),'pending')
  assert.equal(await db.prepare('SELECT status FROM payment_checkout_holds').first('status'),'converted')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events').first('n'),1)
  assert.equal(await db.prepare('SELECT receipt_url FROM payments').first('receipt_url'),'https://pay.stripe.com/test-receipt')
 }finally{await runtime.dispose()}
})
test('expired hold late capture refunds full principal and retains captured-volume usage', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'late','2020-01-01T00:00:00.000Z')
  const p=provider('late');await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'late'),p.intent)
  await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'late'),p.intent)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),0)
  assert.equal(p.refunds(),1)
  assert.equal(await db.prepare('SELECT refunded_amount FROM payments').first('refunded_amount'),10000)
  assert.equal(await db.prepare('SELECT amount FROM payment_usage_events').first('amount'),10000)
 }finally{await runtime.dispose()}
})
test('timely capture delivered after hold release converts only while current capacity remains', {timeout:120000},async()=>{
 for(const occupied of [false,true]){
  const {db,runtime}=await boot();try{
   await payable(db,'delayed','2026-10-01T01:00:00.000Z')
   await db.prepare("UPDATE payment_checkout_holds SET status='released'").run()
   if(occupied)await claimSessionCapacity(db,{organizationId:ORG,productId:'product',sessionId:'session',productVariantId:'variant',partySize:1,userId:'other'})
   const p=provider('delayed')
   await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'delayed'),p.intent)
   await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'delayed'),p.intent)
   assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),1)
   assert.equal(await db.prepare('SELECT status FROM payment_checkout_holds').first('status'),occupied?'released':'converted')
   assert.equal(p.refunds(),occupied?1:0)
   assert.equal(await db.prepare('SELECT refunded_amount FROM payments').first('refunded_amount'),occupied?10000:0)
   assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events').first('n'),1)
  }finally{await runtime.dispose()}
 }
})
test('native financial identity mismatches cannot capture or allocate', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{await payable(db,'scope');const p=provider('scope'),payment=await requirePayment(db,ORG,'scope')
  for(const override of [{livemode:true},{currency:'thb'},{metadata:{krabiclaw_payment_id:'other'}},{amount_received:9999}])await assert.rejects(()=>reconcilePaymentIntent(db,p.stripe,payment, {...p.intent,...override} as Stripe.PaymentIntent))
 }finally{await runtime.dispose()}
})
test('Stripe actual cost report replay and correction bill only attributable deltas', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'cost');await db.prepare("UPDATE payments SET stripe_charge_id='ch:cost' WHERE id='cost'").run()
  const csv=(amount:string)=>`fee_transaction_id,incurred_by,currency,amount,tax,incurred_at\nfee1,ch:cost,usd,${amount},0.20,2026-10-01T00:00:00Z\nfee2,unknown,usd,5.00,0,2026-10-01T00:00:00Z\n`
  await ingestStripeFeeReport(db,false,csv('3.00'));await ingestStripeFeeReport(db,false,csv('3.00'));await ingestStripeFeeReport(db,false,csv('2.00'))
  const events=(await db.prepare("SELECT amount,kind FROM payment_usage_events ORDER BY created_at,kind").all()).results
  assert.equal(events.length,2);assert.equal(events.reduce((sum,row)=>sum+Number(row.amount),0),220)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_cost_snapshots WHERE organization_id IS NULL').first('n'),1)
  assert.throws(()=>stripeFeeMinor('1.3370','USD'))
 }finally{await runtime.dispose()}
})
test('cross-device purchase claim needs possession, expires and consumes all sibling proofs', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'claim');await db.prepare("UPDATE payments SET captured_amount=10000 WHERE id='claim'").run()
  await assert.rejects(()=>createPurchaseClaim(db,'other','claim'))
  const first=await createPurchaseClaim(db,'guest','claim'),second=await createPurchaseClaim(db,'guest','claim')
  await claimPurchase(db,'verified',first.claim_code)
  assert.equal(await db.prepare("SELECT buyer_user_id FROM payments WHERE id='claim'").first('buyer_user_id'),'verified')
  await assert.rejects(()=>claimPurchase(db,'other',first.claim_code));await assert.rejects(()=>claimPurchase(db,'other',second.claim_code))
 }finally{await runtime.dispose()}
})
test('Metronome conversion preserves exact minor units without FX',()=>{
 assert.equal(metronomeCurrencyAmount(12345,'USD'),'12345')
 assert.equal(metronomeCurrencyAmount(12345,'THB'),'123.45')
 assert.equal(metronomeCurrencyAmount(-101,'THB'),'-1.01')
 assert.throws(()=>stripeFeeMinor('1.337','USD'))
})

test('paid review rejection requires fresh browser approval and commits release with full refund intent once', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'reject')
  await db.prepare("INSERT INTO member(id,organizationId,userId,role) VALUES('operator',?,'verified','owner')").bind(ORG).run()
  const queries=requestInsertQueries({id:'request',kind:'booking',organization_id:ORG,location_id:null,user_id:'guest',review_id:null,conversation_state:'needs_attention',resolved_at:null,payload:threadPayloadForGuest({name:'Guest',email:'guest@example.com'}),created_at:NOW,updated_at:NOW})
  await db.batch(queries.map(q=>db.prepare(q.query).bind(...q.params!)))
  await db.prepare("UPDATE payment_checkout_holds SET request_id='request' WHERE payment_id='reject'").run()
  const p=provider('reject');await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'reject'),p.intent)
  const input={threadId:'request',organizationId:ORG,action:'reject',actorUserId:'verified',idempotencyKey:'reject-once',env:{NUXT_PUBLIC_PLATFORM_DOMAIN:'https://proof.example',EMAIL_REPLY_SECRET:'proof',EMAIL_DELIVERY_MODE:'log_only'}}
  await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES('paid-change-session',?,'product','America/New_York',?,?,3,'scheduled','guest','guest')").bind(ORG,new Date(Date.now()+86400000).toISOString(),new Date(Date.now()+90000000).toISOString()).run()
  const thread=await getGuestRequest(db,'request',ORG);assert(thread)
  await assert.rejects(()=>requestBookingChange(db,{...input.env,DB:db,BETTER_AUTH_URL:'https://proof.example',BETTER_AUTH_SECRET:'local-proof-secret-long-enough-for-auth',STRIPE_SECRET_KEY:'sk_test_local_d1_no_stripe_requests'},thread,'verified',{kind:'booking',sessionId:'paid-change-session',partySize:2,expectedUpdatedAt:thread.updated_at},'paid-size-change'),/Refund the paid booking before changing its quantity or location/)
  assert.equal(await db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE event_name='booking.change.requested'").first('n'),0)
  await assert.rejects(()=>executeGuestThreadOperation(db,input),error=>{
   const result=mcpFinancialApprovalErrorResult(error,'https://proof.example','Paid rejection requires explicit approval')
   assert(result?.isError)
   assert.equal(result.structuredContent.success,false)
   assert.equal(result.structuredContent.operation_completed,false)
   assert.equal(result.structuredContent.confirmation_required,true)
   assert.match(result.structuredContent.financial_approval_url,/^https:\/\/proof.example\/dashboard\/payments\/payments\/refunds\/approve\?id=/u)
   return true
  })
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_refunds').first('n'),0)
  assert.equal(await db.prepare('SELECT status FROM bookings').first('status'),'pending')
  assert.equal((await executeGuestThreadOperation(db,{...input,action:'cancel'})).ok,false)
  const authorization=await db.prepare("SELECT id FROM payment_authorizations ORDER BY rowid DESC LIMIT 1").first<string>('id');assert(authorization)
  const principal={organizationId:ORG,userId:'verified',role:'owner'}
  await approveRefundAuthorization(db,principal,authorization)
  await db.prepare("UPDATE payment_authorizations SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(authorization).run()
  await assert.rejects(()=>executeGuestThreadOperation(db,{...input,financialAuthorizationId:authorization}),/explicit approval/)
  assert.equal(await db.prepare('SELECT status FROM bookings').first('status'),'pending')
  const fresh=await db.prepare("SELECT id FROM payment_authorizations ORDER BY rowid DESC LIMIT 1").first<string>('id');assert(fresh)
  await approveRefundAuthorization(db,principal,fresh)
  const partial=await requestRefundAuthorization(db,principal,'reject',1000)
  await approveRefundAuthorization(db,principal,partial.authorization_id)
  await refundPayment(db,p.stripe,principal,partial.authorization_id)
  await assert.rejects(()=>executeGuestThreadOperation(db,{...input,financialAuthorizationId:fresh}),/explicit approval/)
  assert.equal(await db.prepare('SELECT status FROM bookings').first('status'),'pending')
  const remaining=await db.prepare("SELECT id FROM payment_authorizations WHERE action='reject_booking' ORDER BY rowid DESC LIMIT 1").first<string>('id');assert(remaining)
  await approveRefundAuthorization(db,principal,remaining)
  const accepted={...input,financialAuthorizationId:remaining}
  assert.equal((await executeGuestThreadOperation(db,accepted)).ok,true)
  assert.equal((await executeGuestThreadOperation(db,accepted)).ok,true)
  assert.equal(await db.prepare('SELECT status FROM bookings').first('status'),'cancelled')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_refunds').first('n'),2)
  assert.equal(await db.prepare('SELECT SUM(amount) n FROM payment_refunds').first('n'),10000)
  const bookingId=await db.prepare('SELECT id FROM bookings').first<string>('id');assert(bookingId)
  await executeRefund(db,p.stripe,await requirePayment(db,ORG,'reject'),9000,`rejected:${bookingId}`,'requested_by_customer','verified')
  assert.equal(p.refunds(),2)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events').first('n'),1)
 }finally{await runtime.dispose()}
})

test('authorized tenant deletion retains financial evidence and late capture servicing without tenant recreation', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  const {retainPaymentsForTenantDeletion}=await import('../../server/domain/payments/retention.ts')
  await payable(db,'deleted')
  await db.prepare("INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,metronome_customer_id,metronome_contract_id,contract_start_at,currency,status,updated_at) VALUES(?,'cus_operating','metro_customer','metro_contract',?,'USD','active',?)").bind(ORG,NOW,NOW).run()
  await retainPaymentsForTenantDeletion(db,ORG)
  await db.prepare('DELETE FROM organization WHERE id=?').bind(ORG).run()
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM organization').first('n'),0)
  assert.equal(await db.prepare('SELECT organization_id FROM payments').first('organization_id'),ORG)
  assert.equal(await db.prepare('SELECT status FROM payment_billing_accounts').first('status'),'servicing')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_servicing_tenants').first('n'),1)
  const p=provider('deleted');await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'deleted'),p.intent)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),0)
  assert.equal(await db.prepare('SELECT refunded_amount FROM payments').first('refunded_amount'),10000)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events').first('n'),1)
 }finally{await runtime.dispose()}
})
test('concurrent merchant refunds reserve remaining principal atomically', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'refund-race');const p=provider('refund-race');await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'refund-race'),p.intent)
  const payment=await requirePayment(db,ORG,'refund-race')
  const results=await Promise.allSettled(['one','two'].map(key=>executeRefund(db,p.stripe,payment,6000,key,'requested_by_customer','verified')))
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1)
  assert.equal(p.refunds(),1)
  assert.equal(await db.prepare('SELECT refunded_amount FROM payments').first('refunded_amount'),6000)
  assert.equal(await db.prepare("SELECT SUM(amount) n FROM payment_refunds WHERE status='succeeded'").first('n'),6000)
 }finally{await runtime.dispose()}
})
test('approved refund recovery survives expiry and webhook-first delivery without a second refund', {timeout:120000},async(t)=>{
 const {db,runtime}=await boot();try{
  await payable(db,'refund-recovery');const p=provider('refund-recovery',true)
  await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'refund-recovery'),p.intent)
  const principal={organizationId:ORG,userId:'verified',role:'owner'}
  const authorization=await requestRefundAuthorization(db,principal,'refund-recovery',1000)
  await approveRefundAuthorization(db,principal,authorization.authorization_id)
  await assert.rejects(()=>refundPayment(db,p.stripe,principal,authorization.authorization_id),/response was lost/u)
  assert.equal(await db.prepare('SELECT consumed_at FROM payment_authorizations WHERE id=?').bind(authorization.authorization_id).first('consumed_at'),null)
  t.mock.timers.enable({apis:['Date']});t.mock.timers.setTime(Date.now()+11*60*1000)
  await refundPayment(db,p.stripe,principal,authorization.authorization_id)
  assert.equal(p.refunds(),1)
  assert.ok(await db.prepare('SELECT consumed_at FROM payment_authorizations WHERE id=?').bind(authorization.authorization_id).first('consumed_at'))
  const webhook=await requestRefundAuthorization(db,principal,'refund-recovery',1000)
  await approveRefundAuthorization(db,principal,webhook.authorization_id)
  await assert.rejects(()=>refundPayment(db,p.stripe,principal,webhook.authorization_id),/response was lost/u)
  await reconcileRefundState(db,p.stripe,await requirePayment(db,ORG,'refund-recovery'),'re:refund-recovery:2')
  assert.ok(await db.prepare('SELECT consumed_at FROM payment_authorizations WHERE id=?').bind(webhook.authorization_id).first('consumed_at'))
  await refundPayment(db,p.stripe,principal,webhook.authorization_id)
  assert.equal(p.refunds(),2)
  assert.equal(await db.prepare('SELECT refunded_amount FROM payments').first('refunded_amount'),2000)
 }finally{await runtime.dispose()}
})
test('billing decisions respect native draft/finalized periods and retain negative final credits',async()=>{
 const {usageBillingDecision}=await import('../../server/domain/payments/usage.ts')
 const event={kind:'stripe_cost',amount:320,provider_occurred_at:'2026-09-30T23:00:00.000Z'},now='2026-10-02T00:00:00.000Z'
 const draft={start_timestamp:'2026-09-01T00:00:00Z',end_timestamp:'2026-10-01T00:00:00Z',status:'DRAFT'}
 assert.deepEqual(usageBillingDecision(event,[draft],now),{timestamp:event.provider_occurred_at,adjustment:false,requiresCredit:false})
 assert.deepEqual(usageBillingDecision(event,[{...draft,status:'FINALIZED'}],now),{timestamp:now,adjustment:true,requiresCredit:false})
 assert.deepEqual(usageBillingDecision({...event,kind:'stripe_cost_adjustment',amount:-100},[{...draft,status:'FINALIZED'}],now),{timestamp:now,adjustment:true,requiresCredit:true})
})

test('connected webhook replay is account/mode namespaced and retains only minimal outbox identity', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'event')
  await db.prepare("INSERT INTO stripe_connected_accounts(id,organization_id,stripe_account_id,livemode,country,status,created_at,updated_at) VALUES('connected',?,'acct_seller',0,'US','ready',?,?)").bind(ORG,NOW,NOW).run()
  const p=provider('event')
  const stripe={...p.stripe,paymentIntents:{retrieve:async()=>p.intent}} as unknown as Stripe
  const payment=await requirePayment(db,ORG,'event')
  const event={id:'evt_shared',type:'payment_intent.succeeded',account:payment.stripe_account_id,livemode:false,data:{object:{id:p.intent.id,metadata:{krabiclaw_payment_id:'event',private_card_data:'must-not-persist'}}}} as unknown as Stripe.Event
  for(let replay=0;replay<3;replay++)await processPaymentEvent(db,stripe,event,JSON.stringify(event))
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),1)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events').first('n'),1)
  const payload=await db.prepare('SELECT payload FROM stripe_webhook_events WHERE stripe_event_id=?').bind(paymentEventKey(event)).first<string>('payload')
  assert(payload&&!payload.includes('private_card_data'))
  assert.notEqual(paymentEventKey(event),paymentEventKey({...event,account:'acct_other'}))
  assert.notEqual(paymentEventKey(event),paymentEventKey({...event,livemode:true}))
 }finally{await runtime.dispose()}
})

test('native dispute principal and deadline project once without reversing captured-volume usage', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'dispute');const p=provider('dispute')
  await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'dispute'),p.intent)
  await db.prepare("INSERT INTO stripe_connected_accounts(id,organization_id,stripe_account_id,livemode,country,status,created_at,updated_at) VALUES('connected',?,'acct_seller',0,'US','ready',?,?)").bind(ORG,NOW,NOW).run()
  const native={id:'dp_native',payment_intent:p.intent.id,currency:'usd',amount:10000,reason:'fraudulent',status:'needs_response',evidence_details:{due_by:1790899200}}
  const stripe={disputes:{retrieve:async()=>native}} as unknown as Stripe
  const event={id:'evt_dispute',type:'charge.dispute.created',account:'acct_seller',livemode:false,data:{object:{id:native.id}}} as unknown as Stripe.Event
  for(let replay=0;replay<2;replay++)await processPaymentEvent(db,stripe,event,JSON.stringify(event))
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_disputes').first('n'),1)
  assert.equal(await db.prepare('SELECT evidence_due_at FROM payment_disputes').first('evidence_due_at'),new Date(native.evidence_details.due_by*1000).toISOString())
  assert.equal(await db.prepare('SELECT SUM(amount) n FROM payment_usage_events').first('n'),10000)
  assert.equal(await db.prepare('SELECT captured_amount FROM payments').first('captured_amount'),10000)
 }finally{await runtime.dispose()}
})

test('native contract end preserves accrued usage and late costs reopen historical servicing without new acceptance', {timeout:120000},async(t)=>{
 const {db,runtime}=await boot(),original=globalThis.fetch,calls:{url:string;body:Record<string,unknown>|unknown[]}[]=[]
 const env={METRONOME_API_KEY:'local_provider_double'} as never
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-01T10:28:25.236Z')})
 let loseEndResponse=true
 globalThis.fetch=async(input,init)=>{const url=String(input),body=init?.body?JSON.parse(String(init.body)):{};calls.push({url,body});if(url.endsWith('/updateEndDate')&&body.ending_before){assert.equal(Date.parse(body.ending_before)%3600000,0,'native contract end requires an hour boundary');if(loseEndResponse){loseEndResponse=false;throw new Error('Native end succeeded but its response was lost')}}return new Response(url.endsWith('/v1/ingest')?'':JSON.stringify({data:url.includes('/invoices')?[]:{id:'native_contract'}}),{status:200})}
 try{
  await db.prepare("INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,metronome_customer_id,metronome_contract_id,contract_start_at,currency,status,updated_at) VALUES(?,'cus_operating','metro_customer','native_contract',?,'USD','servicing',?)").bind(ORG,NOW,NOW).run()
  await db.prepare("INSERT INTO payment_usage_events(id,organization_id,kind,currency,amount,source_id,provider_occurred_at,created_at) VALUES('cost',?,'stripe_cost','USD',100,'native-fee',?,?)").bind(ORG,NOW,NOW).run()
  const principal={organizationId:ORG,userId:'verified',role:'owner'}
  await assert.rejects(finalizePaymentsBilling(db,env,principal),/Deliver accrued usage/)
  assert.equal(calls.length,0)
  await deliverPaymentsUsage(db,env,ORG)
  await assert.rejects(finalizePaymentsBilling(db,env,principal),/response was lost/u)
  assert.equal(await db.prepare('SELECT status FROM payment_billing_accounts').first('status'),'closing')
  assert.equal(await db.prepare('SELECT updated_at FROM payment_billing_accounts').first('updated_at'),'2026-10-01T10:28:25.236Z','persist the actual request instant rather than a future hour')
  t.mock.timers.tick(70*60*1000)
  await finalizePaymentsBilling(db,env,principal)
  assert.equal(await db.prepare('SELECT status FROM payment_billing_accounts').first('status'),'closed')
  const end=calls.find(call=>call.url.endsWith('/updateEndDate'))!.body as Record<string,unknown>
  assert.equal(end.allow_ending_before_finalized_invoice,false);assert.equal(end.ending_before,'2026-10-01T11:00:00.000Z','round forward to preserve every accrued usage timestamp')
  const endingCalls=calls.filter(call=>call.url.endsWith('/updateEndDate'));assert.deepEqual(endingCalls[0]!.body,endingCalls[1]!.body,'lost-response retry retains the same end across an hour boundary')
  await db.prepare("INSERT INTO payment_usage_events(id,organization_id,kind,currency,amount,source_id,provider_occurred_at,created_at) VALUES('late-cost',?,'stripe_cost','USD',50,'late-native-fee',?,?)").bind(ORG,NOW,NOW).run()
  await deliverPaymentsUsage(db,env,ORG)
  const updates=calls.filter(call=>call.url.endsWith('/updateEndDate'))
  assert.equal(updates.length,3);assert.equal('ending_before' in (updates[2]!.body as Record<string,unknown>),false)
  assert.equal(await db.prepare('SELECT status FROM payment_billing_accounts').first('status'),'servicing')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_usage_events WHERE delivery_at IS NULL').first('n'),0)
 }finally{globalThis.fetch=original;await runtime.dispose()}
})


test('final native operating credits enforce tenant, amount, state and single-use settlement', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await db.prepare("INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,contract_start_at,currency,status,updated_at) VALUES(?,'cus_operating',?,'USD','servicing',?)").bind(ORG,NOW,NOW).run()
  for(const id of ['credit','other-credit'])await db.prepare("INSERT INTO payment_usage_events(id,organization_id,kind,currency,amount,source_id,provider_occurred_at,created_at) VALUES(?,?,'stripe_cost_adjustment','USD',-100,?,?,?)").bind(id,ORG,id,NOW,NOW).run()
  const note={id:'cn_native',invoice:'in_operating',status:'issued',currency:'usd',total:100,livemode:false},invoice={id:'in_operating',customer:'cus_operating',livemode:false}
  const stripe={creditNotes:{retrieve:async()=>note},invoices:{retrieve:async()=>invoice}} as unknown as Stripe,principal={organizationId:ORG,userId:'verified',role:'owner'}
  await assert.rejects(()=>reconcileNativeBillingCredit(db,stripe,{...principal,role:'member'},'credit',note.id))
  for(const invalid of [{customer:'cus_buyer'},{livemode:true}]){
   const previous={...invoice};Object.assign(invoice,invalid)
   await assert.rejects(()=>reconcileNativeBillingCredit(db,stripe,principal,'credit',note.id),/does not match/u);Object.assign(invoice,previous)
  }
  for(const invalid of [{total:99},{status:'void'},{currency:'thb'}]){
   const previous={...note};Object.assign(note,invalid)
   await assert.rejects(()=>reconcileNativeBillingCredit(db,stripe,principal,'credit',note.id),/does not match/u);Object.assign(note,previous)
  }
  assert.equal(await db.prepare("SELECT delivery_at FROM payment_usage_events WHERE id='credit'").first('delivery_at'),null)
  assert.equal((await reconcileNativeBillingCredit(db,stripe,principal,'credit',note.id)).settled,true)
  assert.equal((await reconcileNativeBillingCredit(db,stripe,principal,'credit',note.id)).settled,true)
  await assert.rejects(()=>reconcileNativeBillingCredit(db,stripe,principal,'other-credit',note.id))
  assert.equal(await db.prepare("SELECT COUNT(*) n FROM payment_usage_events WHERE credit_note_id='cn_native'").first('n'),1)
  assert.equal(await db.prepare("SELECT delivery_at FROM payment_usage_events WHERE id='other-credit'").first('delivery_at'),null)
 }finally{await runtime.dispose()}
})

test('capture converts the hold’s pinned member even after the offering assignment changes and class attendees share provider occupancy', {timeout:120000},async()=>{
 const {db,runtime}=await boot()
 try {
  await db.prepare("INSERT INTO member(id,organizationId,userId,role)VALUES('provider',?,'verified','member')").bind(ORG).run()
  await db.prepare("INSERT INTO member_scheduling(member_id,organization_id,timezone,weekly_json,time_off_json,windows_json,windows_until,calendar_revision,updated_at,updated_by)VALUES('provider',?,'America/New_York','[]','[]',?,'2100-01-01T00:00:00.000Z','revision',?,'verified')").bind(ORG,JSON.stringify([{start:'2099-10-01T13:00:00.000Z',end:'2099-10-01T14:00:00.000Z'}]),NOW).run()
  await db.prepare("UPDATE product_booking_configs SET scheduling_mode='provider',assigned_member_id='provider' WHERE product_id='product'").run()
  await db.prepare("UPDATE product_sessions SET assigned_member_id='provider',capacity=3 WHERE id='session'").run()
  await payable(db,'pinned')
  await db.prepare("UPDATE payment_checkout_holds SET assigned_member_id='provider' WHERE payment_id='pinned'").run()
  const attendee=await claimSessionCapacity(db,{organizationId:ORG,productId:'product',sessionId:'session',productVariantId:'variant',partySize:1})
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(attendee.bookingId).first('assigned_member_id'),'provider')
  await db.prepare("UPDATE product_booking_configs SET assigned_member_id=NULL WHERE product_id='product'").run()
  const p=provider('pinned')
  await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'pinned'),p.intent)
  const converted=await db.prepare("SELECT status,converted_booking_id,assigned_member_id FROM payment_checkout_holds WHERE payment_id='pinned'").first<{status:string;converted_booking_id:string;assigned_member_id:string}>()
  assert.equal(converted?.status,'converted')
  assert.equal(converted?.assigned_member_id,'provider')
  assert.equal(await db.prepare('SELECT assigned_member_id FROM bookings WHERE id=?').bind(converted!.converted_booking_id).first('assigned_member_id'),'provider')
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),2)
  await reconcilePaymentIntent(db,p.stripe,await requirePayment(db,ORG,'pinned'),p.intent)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'),2,'capture replay preserves one conversion')
 }finally{await runtime.dispose()}
})
