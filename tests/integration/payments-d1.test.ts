import assert from 'node:assert/strict'
import test from 'node:test'
import Stripe from 'stripe'
import { HTTPError } from 'nitro'
import { Miniflare } from 'miniflare'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import * as schema from '../../server/db/schema.ts'
import { claimSessionCapacity } from '../../server/utils/availability.ts'
import { ingestStripeFeeReport, stripeFeeMinor } from '../../server/domain/payments/costs.ts'
import { buyerPayments, claimCheckoutReturn, tokenHash } from '../../server/domain/payments/buyer.ts'
import { retainPaymentsForTenantDeletion } from '../../server/domain/payments/retention.ts'
import paymentsReconcile from '../../server/tasks/payments-reconcile.ts'
import { deliverPaymentsUsage, paymentsUsageStatus, reconcileNativeBillingCredit } from '../../server/domain/payments/usage.ts'
import { getStripe } from '../../server/utils/billing.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
const ORG = 'payments-org', NOW = '2026-10-01T00:00:00.000Z'
async function boot(){
 const runtime=new Miniflare({workers:[{config:{name:'payments-proof',type:'worker',compatibilityDate:'2024-11-01',manifest:{mainModule:'index.mjs',modules:{'index.mjs':{type:'esm',contents:'export default {fetch(){return new Response("ok")}}'}}},env:{DB:{type:'d1'}}}}]})
 const db=await runtime.getD1Database('DB')
 try {
 const migration=await generateSQLiteMigration(await generateSQLiteDrizzleJson({}),await generateSQLiteDrizzleJson(schema))
 await db.batch(migration.map(query=>db.prepare(query)))
 await db.prepare(`INSERT INTO organization(id,name,slug,subdomain,settings_json,theme_id,default_currency,status,onboarding_status,url_structure,vertical,updated_at) VALUES(?,'Payments','payments','payments','{"config":{"default_timezone":"America/New_York"}}','theme','USD','active','complete','flat','experience',?)`).bind(ORG,NOW).run()
 for(const id of ['guest','verified','other'])await db.prepare("INSERT INTO user(id,name,email,emailVerified,isAnonymous) VALUES(?,?,?,1,?)").bind(id,id,`${id}@example.com`,Number(id==='guest')).run()
 await db.prepare("INSERT INTO products(kind,id,organization_id,name,slug,created_by,updated_by) VALUES('service','product',?,'Consultation','consultation','guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_variants(id,organization_id,product_id,name,created_by,updated_by) VALUES('variant',?,'product','Hour','guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_booking_configs(product_id,organization_id,duration_minutes,default_capacity,confirmation_mode,online_timezone,calendar_group,online_payment_required,created_by,updated_by) VALUES('product',?,60,1,'review','America/New_York','online',1,'guest','guest')").bind(ORG).run()
 await db.prepare("INSERT INTO product_sessions(id,organization_id,product_id,timezone,starts_at,ends_at,capacity,status,created_by,updated_by) VALUES('session',?,'product','America/New_York','2099-10-01T13:00:00.000Z','2099-10-01T14:00:00.000Z',1,'scheduled','guest','guest')").bind(ORG).run()
 return {db,runtime}
 }catch(error){await runtime.dispose();throw error}
}
async function payable(db:D1Database,id:string,expires='2099-09-30T00:00:00.000Z'){
 await db.prepare("INSERT INTO payments(id,organization_id,buyer_user_id,stripe_account_id,livemode,subject_type,currency,amount,price_snapshot_json,created_at,updated_at) VALUES(?,?,'guest','acct_seller',0,'booking','USD',10000,?,?,?)").bind(id,ORG,JSON.stringify({title:'Consultation',price:{unit_amount:10000,currency:'USD'},quantity:1}),NOW,NOW).run()
 await db.prepare("INSERT INTO payment_attempts(id,payment_id,idempotency_key,stripe_checkout_id,return_token,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,'test-return-proof','open',?,?,?)").bind(`a:${id}`,id,`checkout:${id}`,`cs:${id}`,expires,NOW,NOW).run()
 await db.prepare("INSERT INTO payment_checkout_holds(id,organization_id,product_id,variant_id,price_id,session_id,buyer_user_id,payment_id,quantity,amount,currency,calendar_group,starts_at,ends_at,status,expires_at,created_at) VALUES(?,?,'product','variant','price','session','guest',?,1,10000,'USD','online','2099-10-01T13:00:00.000Z','2099-10-01T14:00:00.000Z','active',?,?)").bind(`h:${id}`,ORG,id,expires,NOW).run()
}
test('an active payment hold consumes the canonical session capacity until release', { timeout: 120_000 }, async () => {
 const { db, runtime } = await boot()
 try {
  await payable(db, 'held')
  await assert.rejects(() => claimSessionCapacity(db, { organizationId: ORG, productId: 'product', sessionId: 'session', productVariantId: 'variant', partySize: 1 }), /no longer has room/u)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM bookings').first('n'), 0)
  await db.prepare("UPDATE payment_checkout_holds SET status='released' WHERE payment_id='held'").run()
  const booking = await claimSessionCapacity(db, { organizationId: ORG, productId: 'product', sessionId: 'session', productVariantId: 'variant', partySize: 1 })
  assert.equal(await db.prepare('SELECT party_size FROM bookings WHERE id=?').bind(booking.bookingId).first('party_size'), 1)
 } finally { await runtime.dispose() }
})
test('Stripe cost report replay and correction bill attributable deltas while conflicting tenant mappings remain unbilled', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'cost');await db.prepare("UPDATE payments SET stripe_charge_id='ch:cost' WHERE id='cost'").run()
  await db.prepare("INSERT INTO stripe_connected_accounts(id,organization_id,stripe_account_id,livemode,country,status,created_at,updated_at) VALUES('connected',?,'acct_seller',0,'US','ready',?,?)").bind(ORG,NOW,NOW).run()
  await db.prepare("INSERT INTO payment_servicing_tenants(organization_id,stripe_account_id,livemode,retained_at) VALUES('deleted-other-tenant','acct_seller',0,?)").bind(NOW).run()
  const csv=(amount:string)=>`fee_transaction_id,incurred_by,currency,amount,tax,incurred_at\nfee1,ch:cost,usd,${amount},0.20,2026-10-01T00:00:00Z\nfee2,unknown,usd,5.00,0,2026-10-01T00:00:00Z\nfee3,acct_seller,usd,1.00,0,2026-10-01T00:00:00Z\n`
  await ingestStripeFeeReport(db,false,csv('3.00'));await ingestStripeFeeReport(db,false,csv('3.00'));await ingestStripeFeeReport(db,false,csv('2.00'))
  const events=(await db.prepare("SELECT amount,kind FROM payment_usage_events ORDER BY kind").all()).results
  assert.deepEqual(events,[{amount:320,kind:'stripe_cost'},{amount:-100,kind:'stripe_cost_adjustment'}])
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payment_cost_snapshots WHERE organization_id IS NULL').first('n'),2)
  assert.equal(await db.prepare("SELECT organization_id FROM payment_cost_snapshots WHERE incurred_by='acct_seller'").first('organization_id'),null)
  assert.throws(()=>stripeFeeMinor('1.2340','USD'), /precision exceeds/u)
 }finally{await runtime.dispose()}
})

test('Checkout proof attaches ownership without exposing merchant financial data or transferring an authenticated purchase', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'claim')
  await db.prepare("UPDATE payments SET captured_amount=10000,state='captured',stripe_payment_intent_id='pi:claim',stripe_charge_id='ch:claim',receipt_url='https://example.com/receipt' WHERE id='claim'").run()
  await db.prepare("INSERT INTO payment_refunds(id,payment_id,idempotency_key,stripe_refund_id,amount,reason,status,error,created_by,created_at,updated_at) VALUES('refund:claim','claim','refund-retry:claim','re:claim',1000,'requested_by_customer','pending','operator-only diagnostic','other',?,?)").bind(NOW,NOW).run()
  const token=crypto.randomUUID()+crypto.randomUUID(),hash=await tokenHash(token)
  await db.prepare("INSERT INTO payment_claims(token_hash,payment_id,expires_at)VALUES(?,'claim','2099-01-01T00:00:00.000Z')").bind(hash).run()
  await claimCheckoutReturn(db,'verified',token)
  const owned=await buyerPayments(db,'verified')
  assert.deepEqual(owned.payments.map(payment=>payment.id),['claim'])
  assert.equal(owned.payments[0]?.title,'Consultation')
  assert.equal(owned.payments[0]?.captured_amount,10000)
  assert.equal(owned.payments[0]?.refunded_amount,0)
  assert.equal(owned.payments[0]?.state,'captured')
  assert.equal(owned.payments[0]?.receipt_url,'https://example.com/receipt')
  for(const field of ['stripe_account_id','stripe_payment_intent_id','stripe_charge_id','livemode','buyer_user_id','price_snapshot_json'])assert.equal(Object.hasOwn(owned.payments[0]!,field),false)
  assert.equal(owned.refunds[0]?.amount,1000)
  assert.equal(owned.refunds[0]?.currency,'USD')
  assert.equal(owned.refunds[0]?.status,'pending')
  for(const field of ['idempotency_key','stripe_refund_id','reason','error','attempted_at','created_by'])assert.equal(Object.hasOwn(owned.refunds[0]!,field),false)
  assert.deepEqual(await db.prepare("SELECT stripe_account_id,stripe_payment_intent_id,stripe_charge_id,buyer_user_id FROM payments WHERE id='claim'").first(),{stripe_account_id:'acct_seller',stripe_payment_intent_id:'pi:claim',stripe_charge_id:'ch:claim',buyer_user_id:'verified'})
  assert.deepEqual(await db.prepare("SELECT idempotency_key,stripe_refund_id,error,created_by FROM payment_refunds WHERE id='refund:claim'").first(),{idempotency_key:'refund-retry:claim',stripe_refund_id:'re:claim',error:'operator-only diagnostic',created_by:'other'})
  assert.equal(await db.prepare("SELECT buyer_user_id FROM payment_checkout_holds WHERE payment_id='claim'").first('buyer_user_id'),'verified')
  await assert.rejects(()=>claimCheckoutReturn(db,'other',token),/expired or already used/u)

  const otherToken=crypto.randomUUID()+crypto.randomUUID(),otherHash=await tokenHash(otherToken)
  await db.prepare("INSERT INTO payment_claims(token_hash,payment_id,expires_at)VALUES(?,'claim','2099-01-01T00:00:00.000Z')").bind(otherHash).run()
  await assert.rejects(()=>claimCheckoutReturn(db,'other',otherToken),/expired or already used/u)
  assert.equal(await db.prepare('SELECT claimed_at FROM payment_claims WHERE token_hash=?').bind(otherHash).first('claimed_at'),null)
  assert.deepEqual((await buyerPayments(db,'verified')).payments.map(payment=>payment.id),['claim'])
  assert.equal((await buyerPayments(db,'other')).payments.length,0)
  assert.equal((await buyerPayments(db,'other')).refunds.length,0)
  await claimCheckoutReturn(db,'verified',otherToken)
  const claimed=await db.prepare('SELECT claimed_at,claimed_user_id FROM payment_claims WHERE token_hash=?').bind(otherHash).first()
  assert.equal(typeof claimed?.claimed_at,'string')
  assert.equal(claimed?.claimed_user_id,'verified')
  assert.deepEqual((await buyerPayments(db,'verified')).payments.map(payment=>payment.id),['claim'])
 }finally{await runtime.dispose()}
})

test('tenant deletion retains its connected account for servicing before any capture', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await db.prepare("INSERT INTO stripe_connected_accounts(id,organization_id,stripe_account_id,country,livemode,status,card_payments_status,requirements_json,created_at,updated_at)VALUES('connected',?,'acct_no_payments','US',0,'ready','active','[]',?,?)").bind(ORG,NOW,NOW).run()
  await retainPaymentsForTenantDeletion(db,ORG)
  await retainPaymentsForTenantDeletion(db,ORG)
  await db.prepare('DELETE FROM organization WHERE id=?').bind(ORG).run()
  const retained=await db.prepare('SELECT organization_id,stripe_account_id,livemode FROM payment_servicing_tenants').all()
  assert.deepEqual(retained.results,[{organization_id:ORG,stripe_account_id:'acct_no_payments',livemode:0}])
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM payments').first('n'),0)
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM stripe_connected_accounts').first('n'),0)
  await assert.rejects(()=>paymentsReconcile.run({name:'payments:reconcile',payload:{},context:{cloudflare:{env:{DB:db}}}}),/Stripe configuration is required for outstanding Payments reconciliation/u)
 }finally{await runtime.dispose()}
})

test('tenant deletion refuses a connected account retained for another tenant without changing acceptance state', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'retention-conflict')
  await db.prepare("INSERT INTO stripe_connected_accounts(id,organization_id,stripe_account_id,country,livemode,status,card_payments_status,requirements_json,created_at,updated_at)VALUES('connected',?,'acct_seller','US',0,'ready','active','[]',?,?)").bind(ORG,NOW,NOW).run()
  await db.prepare("INSERT INTO payment_servicing_tenants(organization_id,stripe_account_id,livemode,retained_at)VALUES('deleted-other-tenant','acct_seller',0,?)").bind(NOW).run()
  await db.prepare("INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,contract_start_at,currency,status,updated_at)VALUES(?,'cus_billing',?,'USD','active',?)").bind(ORG,NOW,NOW).run()
  await assert.rejects(()=>retainPaymentsForTenantDeletion(db,ORG),/conflicting Payments servicing ownership/u)
  assert.equal(await db.prepare('SELECT organization_id FROM payment_servicing_tenants WHERE stripe_account_id=? AND livemode=0').bind('acct_seller').first('organization_id'),'deleted-other-tenant')
  assert.equal(await db.prepare('SELECT stripe_account_id FROM stripe_connected_accounts WHERE organization_id=?').bind(ORG).first('stripe_account_id'),'acct_seller')
  assert.equal(await db.prepare('SELECT id FROM organization WHERE id=?').bind(ORG).first('id'),ORG)
  assert.equal(await db.prepare("SELECT status FROM payment_checkout_holds WHERE payment_id='retention-conflict'").first('status'),'active')
  assert.equal(await db.prepare('SELECT status FROM payment_billing_accounts WHERE organization_id=?').bind(ORG).first('status'),'active')
 }finally{await runtime.dispose()}
})

test('reconciliation releases expired capacity and reports missing provider configuration for outstanding work', {timeout:120000},async()=>{
 const {db,runtime}=await boot();try{
  await payable(db,'expired','2000-01-01T00:00:00.000Z')
  await assert.rejects(()=>paymentsReconcile.run({name:'payments:reconcile',payload:{},context:{cloudflare:{env:{DB:db}}}}),/Stripe configuration is required for outstanding Payments reconciliation/u)
  assert.equal(await db.prepare("SELECT status FROM payment_checkout_holds WHERE payment_id='expired'").first('status'),'released')
  const booking=await claimSessionCapacity(db,{organizationId:ORG,productId:'product',sessionId:'session',productVariantId:'variant',partySize:1})
  assert.equal(await db.prepare('SELECT party_size FROM bookings WHERE id=?').bind(booking.bookingId).first('party_size'),1)
 }finally{await runtime.dispose()}
})

test('failed historical reconciliation rotates later payments while reporting every Stripe failure', {timeout:120000},async(t)=>{
 const {db,runtime}=await boot();try{
  const historical=Array.from({length:26},(_,index)=>({id:`historical-${String(index).padStart(2,'0')}`,intent:`pi_historical_${String(index).padStart(2,'0')}`,updatedAt:new Date(Date.parse(NOW)+index*1000).toISOString()}))
  await db.batch(historical.map(payment=>db.prepare("INSERT INTO payments(id,organization_id,buyer_user_id,stripe_account_id,livemode,subject_type,currency,amount,captured_amount,state,stripe_payment_intent_id,price_snapshot_json,created_at,updated_at)VALUES(?,?,'guest','acct_seller',0,'order','USD',10000,10000,'captured',?,?,?,?)").bind(payment.id,ORG,payment.intent,JSON.stringify({price:{unit_amount:10000,currency:'USD'},quantity:1}),NOW,payment.updatedAt)))
  const before=(await db.prepare('SELECT * FROM payments ORDER BY id').all()).results
  assert.equal(before.length,26)
  assert.deepEqual(before.map(payment=>({id:payment.id,intent:payment.stripe_payment_intent_id,updatedAt:payment.updated_at})),historical)
  const requests:string[]=[],originalFetch=globalThis.fetch
  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:String(input))
   if(url.origin!=='https://api.stripe.com')return originalFetch(input,init)
   assert.equal(init?.method,'GET')
   assert.equal(new Headers(init?.headers).get('stripe-account'),'acct_seller')
   assert.match(url.pathname,/^\/v1\/payment_intents\/pi_historical_\d{2}$/u)
   const intent=url.pathname.split('/').at(-1)!
   requests.push(intent)
   return Response.json({error:{type:'invalid_request_error',code:'resource_missing',message:`No such payment_intent: '${intent}'`}},{status:404,headers:{'stripe-should-retry':'false'}})
  })
  const run={name:'payments:reconcile',payload:{},context:{cloudflare:{env:{DB:db,STRIPE_SECRET_KEY:'sk_test_reconciliation_boundary'}}}}
  const snapshots=[before]
  for(let pass=0;pass<2;pass++){
   const started=Date.now(),offset=requests.length
   await assert.rejects(()=>paymentsReconcile.run(run),error=>{
    assert.ok(error instanceof AggregateError)
    assert.equal(error.message,'Payments reconciliation has unresolved provider failures')
    assert.equal(error.errors.length,25)
    for(const failure of error.errors){assert.ok(failure instanceof Stripe.errors.StripeInvalidRequestError);assert.equal(failure.code,'resource_missing')}
    return true
   })
   const finished=Date.now(),requested=requests.slice(offset)
   if(pass===0)assert.deepEqual(requested,historical.slice(0,25).map(payment=>payment.intent))
   else{assert.equal(requested.length,25);assert.equal(requested[0],historical[25]!.intent)}
   const after=(await db.prepare('SELECT * FROM payments ORDER BY id').all()).results
   assert.equal(after.length,26)
   assert.deepEqual(after.map(({updated_at,...payment})=>payment),before.map(({updated_at,...payment})=>payment))
   for(const [index,payment] of after.entries()){
    const previous=snapshots[pass]![index]!
    if(!requested.includes(String(payment.stripe_payment_intent_id))){assert.equal(payment.updated_at,previous.updated_at);continue}
    assert.equal(typeof payment.updated_at,'string')
    const updated=Date.parse(String(payment.updated_at))
    assert.ok(updated>=started&&updated<=finished)
    assert.ok(updated>Date.parse(String(previous.updated_at)))
   }
   snapshots.push(after)
  }
 }finally{await runtime.dispose()}
})

test('owner-serviced credits leave the usage batch without hiding credits or starving later delivery', {timeout:120000},async(t)=>{
 const {db,runtime}=await boot();try{
  const customer='11111111-1111-4111-8111-111111111111',contractId='22222222-2222-4222-8222-222222222222',rateCard='33333333-3333-4333-8333-333333333333'
  const start='2026-09-01T00:00:00.000Z',occurred='2026-09-30T23:00:00.000Z'
  await db.prepare("INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,metronome_customer_id,metronome_contract_id,contract_start_at,currency,status,updated_at)VALUES(?,'cus_operating',?,?,?,'USD','servicing',?)").bind(ORG,customer,contractId,start,NOW).run()
  const credits=Array.from({length:100},(_,index)=>({id:`credit-${String(index).padStart(3,'0')}`,source:`fee-credit:${index}`,createdAt:new Date(Date.parse(NOW)+index*1000).toISOString()}))
  await db.batch(credits.map(credit=>db.prepare("INSERT INTO payment_usage_events(id,organization_id,kind,currency,amount,source_id,provider_occurred_at,created_at)VALUES(?,?,'stripe_cost_adjustment','USD',-100,?,?,?)").bind(credit.id,ORG,credit.source,occurred,credit.createdAt)))
  await db.prepare("INSERT INTO payment_usage_events(id,organization_id,kind,currency,amount,source_id,provider_occurred_at,created_at)VALUES('billable',?,'captured_volume','USD',10000,'capture:billable',?,?)").bind(ORG,NOW,new Date(Date.parse(NOW)+100000).toISOString()).run()
  const before=(await db.prepare('SELECT * FROM payment_usage_events ORDER BY created_at').all()).results
  assert.equal(before.length,101)
  assert.deepEqual(before.map(event=>event.id),[...credits.map(credit=>credit.id),'billable'])
  const native={id:contractId,customer_id:customer,uniqueness_key:`payments:${ORG}`,rate_card_id:rateCard,starting_at:start,customer_billing_provider_configuration:{customer_id:customer,billing_provider:'stripe',delivery_method:'direct_to_billing_provider',configuration:{stripe_customer_id:'cus_operating',stripe_collection_method:'charge_automatically'},delivery_method_configuration:{stripe_account_id:'acct_platform'}}}
  const invoice={id:'44444444-4444-4444-8444-444444444444',customer_id:customer,contract_id:contractId,type:'USAGE',status:'FINALIZED',start_timestamp:start,end_timestamp:NOW,credit_type:{id:'55555555-5555-4555-8555-555555555555',name:'USD (cents)'},total:10000,external_invoice:null}
  let ended=true
  const ingests:unknown[][]=[],creditReads:string[]=[],originalFetch=globalThis.fetch
  // External reads are inputs; failed writes never fabricate native acceptance or settlement.
  t.mock.method(globalThis,'fetch',async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:String(input))
   if(url.origin==='https://api.metronome.com'){
    const body=init?.body?JSON.parse(String(init.body)):undefined
    const readContract={...native,...(ended?{ending_before:'2026-10-02T00:00:00.000Z'}:{})}
    if(url.pathname==='/v2/contracts/get'){assert.equal(init?.method,'POST');assert.deepEqual(body,{customer_id:customer,contract_id:contractId});return Response.json({data:readContract})}
    if(url.pathname==='/v2/contracts/list'){assert.equal(init?.method,'POST');assert.deepEqual(body,{customer_id:customer,limit:20});return Response.json({data:[readContract]})}
    if(url.pathname===`/v1/customers/${customer}/invoices`){assert.equal(init?.method,'GET');assert.equal(url.searchParams.get('contract_id'),contractId);return Response.json({data:[invoice]})}
    assert.equal(url.pathname,'/v1/ingest')
    assert.equal(init?.method,'POST')
    assert.ok(Array.isArray(body))
    ingests.push(body)
    return Response.json({message:'Ingest unavailable at the external test boundary'},{status:503})
   }
   if(url.origin==='https://api.stripe.com'){
    assert.equal(init?.method,'GET')
    if(url.pathname==='/v1/account')return Response.json({id:'acct_platform',object:'account',livemode:false})
    assert.equal(url.pathname,'/v1/credit_notes/cn_owner_credit')
    creditReads.push(url.pathname)
    return Response.json({error:{type:'invalid_request_error',code:'resource_missing',message:'No such credit_note'}},{status:404,headers:{'stripe-should-retry':'false'}})
   }
   return originalFetch(input,init)
  })
  const env={DB:db,STRIPE_SECRET_KEY:'sk_test_credit_boundary',METRONOME_API_KEY:'metronome_external_boundary',METRONOME_RATE_CARD_ID:rateCard} as CloudflareEnv
  const began=Date.now()
  assert.deepEqual(await deliverPaymentsUsage(db,env,ORG),{delivered:0})
  const finished=Date.now(),after=(await db.prepare('SELECT * FROM payment_usage_events ORDER BY created_at').all()).results
  assert.equal(after.length,101)
  assert.deepEqual(after.map(({error,dead_letter_at,...event})=>event),before.map(({error,dead_letter_at,...event})=>event))
  const error='Closed-period actual-cost credit requires native Stripe credit memo settlement; retained for owner servicing'
  for(const event of after.slice(0,100)){assert.equal(event.error,error);assert.equal(typeof event.dead_letter_at,'string');assert.ok(Date.parse(String(event.dead_letter_at))>=began&&Date.parse(String(event.dead_letter_at))<=finished)}
  assert.deepEqual(after[100],before[100])
  assert.equal(ingests.length,0)
  const status=await paymentsUsageStatus(db,env,ORG)
  assert.equal(status.account?.status,'closed')
  assert.deepEqual(status.pending,[{currency:'USD',kind:'captured_volume',event_count:1,amount:10000,error:null},{currency:'USD',kind:'stripe_cost_adjustment',event_count:100,amount:-10000,error}])
  assert.deepEqual(status.credits.map(event=>({id:event.id,source_id:event.source_id,amount:event.amount,error:event.error})),credits.map(credit=>({id:credit.id,source_id:credit.source,amount:-100,error})))
  // A subsequent native read reports the same contract open; held credits stay owner-serviced.
  ended=false
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(()=>deliverPaymentsUsage(db,env,ORG),failure=>{assert.ok(failure instanceof HTTPError);assert.equal(failure.status,502);assert.equal(failure.data?.provider_status,503);return true})
  assert.equal(ingests.length,2)
  assert.deepEqual(ingests[1],ingests[0])
  assert.equal(ingests[0]?.length,1)
  const ingest=ingests[0]?.[0] as {customer_id:string;timestamp:string;event_type:string;properties:Record<string,string>}
  assert.equal(ingest.customer_id,customer)
  assert.equal(ingest.timestamp,NOW)
  assert.equal(ingest.event_type,'payments_captured_volume')
  assert.equal(ingest.properties.payment_source,'capture:billable')
  assert.equal(ingest.properties.amount_minor,'10000')
  await assert.rejects(()=>reconcileNativeBillingCredit(db,getStripe(env),env,{organizationId:ORG,userId:'verified',role:'owner'},credits[0]!.id,'cn_owner_credit'),failure=>{assert.ok(failure instanceof Stripe.errors.StripeInvalidRequestError);assert.equal(failure.code,'resource_missing');return true})
  assert.deepEqual(creditReads,['/v1/credit_notes/cn_owner_credit'])
  const retained=(await db.prepare('SELECT * FROM payment_usage_events ORDER BY created_at').all()).results
  assert.equal(retained.length,101)
  assert.deepEqual(retained.slice(0,100),after.slice(0,100))
  assert.equal(retained[100]?.delivery_at,null)
  assert.equal(retained[100]?.dead_letter_at,null)
  assert.equal(retained[100]?.billing_timestamp,NOW)
  assert.match(String(retained[100]?.error),/Metronome request failed \(503\)/u)
 }finally{await runtime.dispose()}
})
