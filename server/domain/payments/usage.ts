import type Stripe from 'stripe'
import {HTTPError} from 'nitro'
import {execute,queryAll,queryFirst,type DbClient} from '~/server/db'
import {getOrganizationBillingStatus} from '~/server/utils/billing'
import type {CloudflareEnv} from '~/server/utils/auth'
import {currencyFractionDigits,type CurrencyCode} from '~/shared/currencies'
import {authorizePayments,type FinancialPrincipal} from './index'
import {validatePaymentsRateCard} from './rate-card'
import {tokenHash} from './buyer'
import {describeErrorForTelemetry} from '~/server/utils/error-telemetry'

export function metronomeCurrencyAmount(minor:number,currency:CurrencyCode):string {
 if(!Number.isSafeInteger(minor)) throw new Error('Metronome requires exact integer minor units')
 if(currency==='USD') return String(minor)
 const digits=currencyFractionDigits(currency),negative=minor<0?'-':'',whole=Math.abs(minor).toString().padStart(digits+1,'0')
 return digits?`${negative}${whole.slice(0,-digits)}.${whole.slice(-digits)}`:`${negative}${whole}`
}
export async function metronomeRequest(env:CloudflareEnv,path:string,body?:unknown,key?:string):Promise<Record<string,unknown>> {
 if(!env.METRONOME_API_KEY) throw new HTTPError({statusCode:503,statusMessage:'Metronome is not configured'})
 const response=await fetch(`https://api.metronome.com${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${env.METRONOME_API_KEY}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)})
 const raw=await response.text()
 let result:unknown
 try {result=raw.trim()?JSON.parse(raw):null} catch {
  throw new HTTPError({statusCode:502,statusMessage:`Metronome response is invalid (${response.status})`,data:{provider_status:response.status}})
 }
 if(!response.ok) {
  const message=result&&typeof result==='object'&&!Array.isArray(result)&&'message' in result&&typeof result.message==='string'
   ?describeErrorForTelemetry(new Error(result.message.replaceAll(env.METRONOME_API_KEY,'[key redacted]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email redacted]')),500):''
  throw new HTTPError({statusCode:502,statusMessage:`Metronome request failed (${response.status})${message?`: ${message}`:''}`,data:{provider_status:response.status}})
 }
 if(path==='/v1/ingest'&&!raw.trim())return {}
 if(path==='/v1/ingest'&&result===null)return {}
 if(!result || typeof result!=='object' || Array.isArray(result)) throw new Error('Metronome response is invalid')
 return result as Record<string,unknown>
}
export interface BillingAccount {organization_id:string;stripe_billing_customer_id:string;metronome_customer_id:string|null;metronome_contract_id:string|null;contract_start_at:string;currency:string;status:string;updated_at:string}
function providerId(result:Record<string,unknown>):string {
 const data=result.data
 if(!data || typeof data!=='object' || !('id' in data) || typeof data.id!=='string') throw new Error('Metronome provider identity missing')
 return data.id
}
export async function provisionPaymentsBilling(db:DbClient,stripe:Stripe,env:CloudflareEnv,principal:FinancialPrincipal) {
 await authorizePayments(principal,'integration')
 // Billing management is independent of seller payment permissions.
 const {assertRoleAllows}=await import('~/server/utils/member-access')
 await assertRoleAllows({organizationId:principal.organizationId,role:principal.role,permissions:{billing:['update']}})
 const existing=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[principal.organizationId])
 if(!env.METRONOME_RATE_CARD_ID) throw new HTTPError({statusCode:503,statusMessage:'Payments USD Metronome rate card must be configured'})
 await validatePaymentsRateCard(env)
 const billing=await getOrganizationBillingStatus(env,db,principal.organizationId)
 if(!billing.stripeCustomerId) throw new HTTPError({statusCode:409,statusMessage:'Tenant operating billing customer is required'})
 const customer=await stripe.customers.retrieve(billing.stripeCustomerId)
 if(customer.deleted || !customer.invoice_settings.default_payment_method) throw new HTTPError({statusCode:409,statusMessage:'Set an operating payment method as the Stripe Customer default'})
 const nativePlatform=await stripe.accounts.retrieveCurrent()
 const deliveries:Record<string,unknown>[]=[]
 let deliveryCursor:string|null=null
 for(let page=0;page<100;page++){
  const listed=await metronomeRequest(env,'/v1/listConfiguredBillingProviders',{...(deliveryCursor?{next_page:deliveryCursor}:{})})
  if(!Array.isArray(listed.data))throw new Error('Native Metronome billing providers are invalid')
  for(const value of listed.data){
   if(!value||typeof value!=='object')throw new Error('Native Metronome billing provider shape invalid')
   const row=value as Record<string,unknown>,configuration=row.delivery_method_configuration as Record<string,unknown>|undefined
   if(row.billing_provider==='stripe'&&row.delivery_method==='direct_to_billing_provider'&&configuration?.stripe_account_id===nativePlatform.id)deliveries.push(row)
  }
  deliveryCursor=typeof listed.next_page==='string'?listed.next_page:null
  if(!deliveryCursor)break
  if(page===99)throw new Error('Native Metronome billing providers require bounded operator review')
 }
 if(deliveries.length!==1||typeof deliveries[0]!.delivery_method_id!=='string')throw new Error('A unique Metronome delivery connection for this Stripe platform is required')
 const deliveryMethodId=deliveries[0]!.delivery_method_id
 // Metronome requires contract starts on a UTC hour boundary.
 const start=new Date();start.setUTCMinutes(0,0,0)
 const now=existing?.contract_start_at??start.toISOString()
 await execute(db,`INSERT INTO payment_billing_accounts(organization_id,stripe_billing_customer_id,currency,status,contract_start_at,updated_at) VALUES(?,?,'USD','provisioning',?,?) ON CONFLICT(organization_id) DO NOTHING`,[principal.organizationId,billing.stripeCustomerId,now,now])
 const reserved=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[principal.organizationId])
 if(!reserved||reserved.stripe_billing_customer_id!==billing.stripeCustomerId)throw new Error('Operating customer changed during Payments billing setup; resolve native billing mapping')
 const known=reserved.metronome_customer_id?null:await metronomeRequest(env,`/v1/customers?ingest_alias=${encodeURIComponent(`payments:${principal.organizationId}`)}`)
 if(known&&!Array.isArray(known.data))throw new HTTPError({statusCode:502,statusMessage:'Metronome customer list is invalid; billing setup stopped'})
 const knownRows=known?known.data as unknown[]:[]
 if(knownRows.length>1)throw new Error('Payments Metronome ingest alias is ambiguous')
 const knownId=knownRows.length?providerId({data:knownRows[0]}):null
 const metronomeCustomer=reserved.metronome_customer_id??knownId??providerId(await metronomeRequest(env,'/v1/customers',{name:`Payments ${principal.organizationId}`,ingest_aliases:[`payments:${principal.organizationId}`],customer_billing_provider_configurations:[{billing_provider:'stripe',configuration:{stripe_customer_id:billing.stripeCustomerId,stripe_collection_method:'charge_automatically'},delivery_method_id:deliveryMethodId}]},`payments-customer:${principal.organizationId}`))
 await execute(db,'UPDATE payment_billing_accounts SET metronome_customer_id=?,updated_at=? WHERE organization_id=?',[metronomeCustomer,new Date().toISOString(),principal.organizationId])
 const configurations=await metronomeRequest(env,'/v1/getCustomerBillingProviderConfigurations',{customer_id:metronomeCustomer})
 if(!Array.isArray(configurations.data))throw new Error('Native Metronome collection configurations are invalid')
 const matchingConfigurations=configurations.data.filter(value=>{
  if(!value||typeof value!=='object')return false
  const row=value as Record<string,unknown>,config=row.configuration as Record<string,unknown>|undefined,delivery=row.delivery_method_configuration as Record<string,unknown>|undefined
  return !row.archived_at&&row.billing_provider==='stripe'&&row.customer_id===metronomeCustomer&&row.delivery_method_id===deliveryMethodId&&row.delivery_method==='direct_to_billing_provider'&&config?.stripe_customer_id===billing.stripeCustomerId&&config?.stripe_collection_method==='charge_automatically'&&delivery?.stripe_account_id===nativePlatform.id
 }) as Record<string,unknown>[]
 if(matchingConfigurations.length!==1||typeof matchingConfigurations[0]!.id!=='string')throw new Error('A unique operating Stripe customer collection mapping in this platform account is required')
 const billingConfigurationId=matchingConfigurations[0]!.id
 let contract:string|null=null,cursor:string|null=null,attachConfiguration=false
 for(let page=0;page<100;page++){
  const listed=await metronomeRequest(env,'/v2/contracts/list',{customer_id:metronomeCustomer,include_archived:true,limit:20,...(cursor?{cursor}:{})})
  if(!Array.isArray(listed.data))throw new Error('Native Metronome contract list is invalid')
  for(const value of listed.data){
   if(!value||typeof value!=='object')throw new Error('Native Metronome contract shape invalid')
   const row=value as Record<string,unknown>
   if(row.uniqueness_key!==`payments:${principal.organizationId}`)continue
   if(contract||row.archived_at||row.rate_card_id!==env.METRONOME_RATE_CARD_ID||typeof row.starting_at!=='string'||Date.parse(row.starting_at)!==Date.parse(reserved.contract_start_at))throw new Error('Existing native Payments contract conflicts with immutable setup')
   if(reserved.metronome_contract_id&&reserved.metronome_contract_id!==row.id)throw new Error('Persisted Payments contract conflicts with native setup')
   const configuration=row.customer_billing_provider_configuration as Record<string,unknown>|undefined
   if(configuration&&configuration.id!==billingConfigurationId)throw new Error('Existing native Payments contract uses a different billing configuration')
   if(!configuration){
    if(!Array.isArray(row.billing_provider_configuration_schedule)||row.billing_provider_configuration_schedule.length)throw new Error('Existing native Payments contract has an unresolved billing configuration schedule')
    attachConfiguration=true
   }
   contract=providerId({data:row})
  }
  cursor=typeof listed.next_page==='string'?listed.next_page:typeof listed.cursor==='string'?listed.cursor:null
  if(!cursor)break
  if(page===99)throw new Error('Native Payments contracts require bounded operator review')
 }
 if(reserved.metronome_contract_id&&!contract)throw new Error('Persisted Payments contract is missing from native setup')
 if(attachConfiguration)await metronomeRequest(env,'/v2/contracts/edit',{customer_id:metronomeCustomer,contract_id:contract,uniqueness_key:`payments-collection:${principal.organizationId}:${billingConfigurationId}`,add_billing_provider_configuration_update:{billing_provider_configuration:{billing_provider_configuration_id:billingConfigurationId},schedule:{effective_at:'START_OF_CURRENT_PERIOD'}}})
 contract??=providerId(await metronomeRequest(env,'/v1/contracts/create',{customer_id:metronomeCustomer,rate_card_id:env.METRONOME_RATE_CARD_ID,starting_at:reserved.contract_start_at,uniqueness_key:`payments:${principal.organizationId}`,billing_provider_configuration:{billing_provider_configuration_id:billingConfigurationId}},`payments-contract:${principal.organizationId}`))
 const verified=await metronomeRequest(env,'/v2/contracts/get',{customer_id:metronomeCustomer,contract_id:contract})
 const verifiedContract=verified.data as Record<string,unknown>|undefined
 const verifiedConfiguration=verifiedContract?.customer_billing_provider_configuration as Record<string,unknown>|undefined
 if(verifiedContract?.id!==contract||verifiedConfiguration?.id!==billingConfigurationId)throw new Error('Native Payments contract collection mapping was not applied')
 await execute(db,'UPDATE payment_billing_accounts SET metronome_contract_id=?,status=?,updated_at=? WHERE organization_id=?',[contract,['closed','closing','servicing'].includes(reserved.status)?reserved.status:'active',new Date().toISOString(),principal.organizationId])
 return await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[principal.organizationId])
}
export async function paymentsUsageStatus(db:DbClient,env:CloudflareEnv,organizationId:string) {
 const account=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[organizationId])
 const pending=await queryAll(db,`SELECT currency,kind,COUNT(*) AS event_count,SUM(amount) AS amount,MAX(error) AS error FROM payment_usage_events WHERE organization_id=? AND delivery_at IS NULL GROUP BY currency,kind`,[organizationId])
 if(!account?.metronome_customer_id||!account.metronome_contract_id) return {configured:false,pending,invoices:[],source:'Metronome configuration missing; durable accrued events retained'}
 return {configured:true,pending,account,invoices:await metronomeInvoices(env,account.metronome_customer_id),source:'Metronome',refreshed_at:new Date().toISOString()}
}
export async function deliverPaymentsUsage(db:DbClient,env:CloudflareEnv,organizationId:string) {
 const account=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[organizationId])
 if(!account?.metronome_customer_id||!account.metronome_contract_id) throw new Error('Payments billing mapping missing; accrued usage remains undelivered')
 const events=await queryAll<{id:string;kind:string;currency:CurrencyCode;amount:number;source_id:string;provider_occurred_at:string;created_at:string;billing_timestamp:string|null}>(db,`SELECT * FROM payment_usage_events WHERE organization_id=? AND delivery_at IS NULL AND dead_letter_at IS NULL ORDER BY created_at LIMIT 100`,[organizationId])
 if(!events.length)return {delivered:0}
 if(['closed','closing'].includes(account.status)){
  // updateEndDate without ending_before is the native documented reopening path.
  // Only historical accrued events reach this path; it grants no new acceptance.
  await metronomeRequest(env,'/v1/contracts/updateEndDate',{customer_id:account.metronome_customer_id,contract_id:account.metronome_contract_id},`payments-servicing:${account.metronome_contract_id}:${events[0]!.id}`)
  await execute(db,"UPDATE payment_billing_accounts SET status='servicing',updated_at=? WHERE organization_id=?",[new Date().toISOString(),organizationId])
 }
 const invoices=await metronomeInvoices(env,account.metronome_customer_id)
 let delivered=0
 for(const event of events){
  if(event.currency!==account.currency)throw new Error(`Payments ${event.currency} costs need a matching provider-currency contract; no FX conversion is available`)
  const decision=usageBillingDecision(event,invoices)
  if(event.provider_occurred_at<account.contract_start_at){decision.timestamp=new Date().toISOString();decision.adjustment=true;decision.requiresCredit=event.amount<0}
  if(decision.requiresCredit){await execute(db,'UPDATE payment_usage_events SET error=? WHERE id=?',['Closed-period actual-cost credit requires native Stripe credit memo settlement; retained for owner servicing',event.id]);continue}
  if(event.billing_timestamp && usageBillingDecision({...event,provider_occurred_at:event.billing_timestamp},invoices).adjustment){
   await execute(db,'UPDATE payment_usage_events SET error=?,dead_letter_at=? WHERE id=?',['Previously attempted usage period has closed; reconcile native acceptance before retiming this event',new Date().toISOString(),event.id]);continue
  }
  const timestamp=event.billing_timestamp ?? decision.timestamp
  await execute(db,'UPDATE payment_usage_events SET billing_timestamp=COALESCE(billing_timestamp,?) WHERE id=?',[timestamp,event.id])
  if(Date.now()-Date.parse(timestamp)>33*86400000){
   await execute(db,'UPDATE payment_usage_events SET error=?,dead_letter_at=? WHERE id=?',['Metronome idempotency window exceeded; reconcile provider acceptance before retry',new Date().toISOString(),event.id])
   continue
  }
  try {
   await metronomeRequest(env,'/v1/ingest',[{transaction_id:`payments:${await tokenHash(event.source_id)}`,customer_id:account.metronome_customer_id,timestamp,event_type:`payments_${event.kind}`,properties:{amount_minor:String(event.amount),currency:event.currency,pricing_amount:metronomeCurrencyAmount(event.amount,event.currency),provider_occurred_at:event.provider_occurred_at,payment_source:event.source_id,billing_adjustment:decision.adjustment?'closed_period_roll_forward':'original_period'}}])
   await execute(db,'UPDATE payment_usage_events SET delivery_at=?,error=NULL WHERE id=?',[new Date().toISOString(),event.id]);delivered++
  }catch(error){
   const status=error instanceof HTTPError?error.data?.provider_status:undefined
   await execute(db,'UPDATE payment_usage_events SET error=?,dead_letter_at=? WHERE id=?',[error instanceof Error?error.message:String(error),typeof status==='number' && status>=400 && status<500 && status!==429?new Date().toISOString():null,event.id])
   throw error
  }
 }
 return {delivered}
}

/** Provider invoice boundaries, not an application-invented grace period. */
export async function metronomeInvoices(env:CloudflareEnv,customerId:string):Promise<Record<string,unknown>[]> {
 const rows:Record<string,unknown>[]=[];let cursor:string|null=null
 for(let page=0;page<100;page++){
  const result=await metronomeRequest(env,`/v1/customers/${encodeURIComponent(customerId)}/invoices?limit=100${cursor?`&next_page=${encodeURIComponent(cursor)}`:''}`)
  if(!Array.isArray(result.data))throw new Error('Metronome invoice list is invalid')
  for(const invoice of result.data){if(!invoice||typeof invoice!=='object'||Array.isArray(invoice))throw new Error('Metronome invoice is invalid');rows.push(invoice as Record<string,unknown>)}
  cursor=typeof result.next_page==='string'?result.next_page:null
  if(!cursor)return rows
 }
 throw new Error('Metronome invoice history exceeded bounded pagination; reconciliation requires operator review')
}
export function usageBillingDecision(event:{kind:string;amount:number;provider_occurred_at:string},invoices:Record<string,unknown>[],now=new Date().toISOString()):{timestamp:string;adjustment:boolean;requiresCredit:boolean} {
 const original=Date.parse(event.provider_occurred_at)
 if(!Number.isFinite(original))throw new Error('Usage source timestamp invalid')
 const period=invoices.find(invoice=>typeof invoice.start_timestamp==='string'&&typeof invoice.end_timestamp==='string'&&Date.parse(invoice.start_timestamp)<=original&&original<Date.parse(invoice.end_timestamp))
 const old=Date.parse(now)-original>33*86400000
 const closed=period && period.status!=='DRAFT'
 return {timestamp:!old&&!closed?event.provider_occurred_at:now,adjustment:Boolean(old||closed),requiresCredit:event.amount<0&&Boolean(old||closed)}
}
/** Negative closed-period/final credits are settled in native Stripe A/R, never dropped by a zero-floor metric. */
export async function reconcileNativeBillingCredit(db:DbClient,stripe:Stripe,principal:FinancialPrincipal,eventId:string,creditNoteId:string) {
 const {assertRoleAllows}=await import('~/server/utils/member-access')
 await assertRoleAllows({organizationId:principal.organizationId,role:principal.role,permissions:{billing:['update']}})
 const account=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[principal.organizationId])
 const event=await queryFirst<{id:string;amount:number;currency:string;delivery_at:string|null;credit_note_id:string|null}>(db,"SELECT * FROM payment_usage_events WHERE id=? AND organization_id=? AND kind='stripe_cost_adjustment' AND amount<0",[eventId,principal.organizationId])
 if(!account||!event)throw new HTTPError({statusCode:404,statusMessage:'Unsettled actual-cost credit not found'})
 if(event.credit_note_id===creditNoteId)return {settled:true,credit_note_id:creditNoteId}
 if(event.delivery_at)throw new HTTPError({statusCode:409,statusMessage:'Cost credit has already been delivered'})
 const note=await stripe.creditNotes.retrieve(creditNoteId)
 const invoiceId=typeof note.invoice==='string'?note.invoice:note.invoice.id
 const invoice=await stripe.invoices.retrieve(invoiceId)
 const customerId=typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id
 if(customerId!==account.stripe_billing_customer_id||note.status!=='issued'||note.currency.toUpperCase()!==event.currency||note.total!==-event.amount||note.livemode!==invoice.livemode)throw new HTTPError({statusCode:409,statusMessage:'Native billing credit does not match this tenant’s attributable credit'})
 const result=await execute(db,'UPDATE payment_usage_events SET credit_note_id=?,delivery_at=?,error=NULL WHERE id=? AND organization_id=? AND delivery_at IS NULL',[note.id,new Date().toISOString(),event.id,principal.organizationId])
 if(result.meta.changes!==1)throw new HTTPError({statusCode:409,statusMessage:'Credit settled concurrently'})
 return {settled:true,credit_note_id:note.id,source:'Stripe native credit note'}
}

/** Explicit native end; never archive/void accrued invoices. Late costs reopen servicing. */
export async function finalizePaymentsBilling(db:DbClient,env:CloudflareEnv,principal:FinancialPrincipal){
 const {assertRoleAllows}=await import('~/server/utils/member-access')
 await assertRoleAllows({organizationId:principal.organizationId,role:principal.role,permissions:{billing:['update']}})
 const account=await queryFirst<BillingAccount>(db,'SELECT * FROM payment_billing_accounts WHERE organization_id=?',[principal.organizationId])
 if(!account?.metronome_customer_id||!account.metronome_contract_id)throw new HTTPError({statusCode:409,statusMessage:'Native Payments usage contract is not configured'})
 if(account.status==='closed')return {closed:true}
 if(!['servicing','closing'].includes(account.status))throw new HTTPError({statusCode:409,statusMessage:'Only a Payments contract in historical servicing can be ended'})
 const now=new Date().toISOString(),requestedAt=account.status==='closing'?account.updated_at:now
 // Native ends require an hour boundary; round up so accrued usage is never truncated.
 const end=new Date(Math.ceil(Date.parse(requestedAt)/3600000)*3600000).toISOString()
 const result=await execute(db,`UPDATE payment_billing_accounts SET status='closing',updated_at=? WHERE organization_id=? AND status IN ('servicing','closing') AND NOT EXISTS(SELECT 1 FROM payment_usage_events WHERE organization_id=? AND delivery_at IS NULL) AND NOT EXISTS(SELECT 1 FROM payment_checkout_holds WHERE organization_id=? AND status='active' AND expires_at>?) AND NOT EXISTS(SELECT 1 FROM payment_refunds r JOIN payments p ON p.id=r.payment_id WHERE p.organization_id=? AND r.status IN ('queued','creating','pending','requires_action'))`,[requestedAt,principal.organizationId,principal.organizationId,principal.organizationId,now,principal.organizationId])
 if(result.meta.changes!==1)throw new HTTPError({statusCode:409,statusMessage:'Deliver accrued usage and complete outstanding checkout/refund servicing before ending the contract'})
 await metronomeRequest(env,'/v1/contracts/updateEndDate',{customer_id:account.metronome_customer_id,contract_id:account.metronome_contract_id,ending_before:end,allow_ending_before_finalized_invoice:false},`payments-end:${account.metronome_contract_id}:${end}`)
 await execute(db,"UPDATE payment_billing_accounts SET status='closed' WHERE organization_id=? AND status='closing' AND updated_at=?",[principal.organizationId,requestedAt])
 return {closed:true,ended_at:end,source:'Metronome native contract end; finalized invoices remain collectible'}
}
