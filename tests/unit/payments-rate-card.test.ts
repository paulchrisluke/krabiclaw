import assert from 'node:assert/strict'
import test from 'node:test'
import {metronomeCurrencyAmount,usageBillingDecision} from '../../server/domain/payments/usage.ts'

test('usage billing preserves draft grace and sends finalized negative adjustments to native credit settlement',()=>{
 const now='2026-10-02T00:00:00.000Z',event={kind:'stripe_cost',amount:320,provider_occurred_at:'2026-09-30T23:00:00.000Z'}
 const draft={type:'USAGE',start_timestamp:'2026-09-01T00:00:00Z',end_timestamp:'2026-10-01T00:00:00Z',status:'DRAFT'}
 assert.deepEqual(usageBillingDecision(event,[draft],now),{timestamp:event.provider_occurred_at,adjustment:false,requiresCredit:false})
 assert.deepEqual(usageBillingDecision(event,[{...draft,status:'FINALIZED'}],now),{timestamp:now,adjustment:true,requiresCredit:false})
 assert.deepEqual(usageBillingDecision({...event,kind:'stripe_cost_adjustment',amount:-100},[{...draft,status:'FINALIZED'}],now),{timestamp:now,adjustment:true,requiresCredit:true})
 assert.deepEqual(usageBillingDecision({...event,amount:-100},[{...draft,status:'FINALIZED'}],now),{timestamp:now,adjustment:true,requiresCredit:true})
 assert.deepEqual(usageBillingDecision({...event,amount:-100},[],now,'2026-10-01T00:00:00Z'),{timestamp:now,adjustment:true,requiresCredit:true})
 assert.deepEqual(usageBillingDecision(event,[{...draft,type:'SCHEDULED',status:'FINALIZED'}],now),{timestamp:event.provider_occurred_at,adjustment:false,requiresCredit:false})
 assert.deepEqual(usageBillingDecision(event,[{...draft,status:'VOID'},draft],now),{timestamp:event.provider_occurred_at,adjustment:false,requiresCredit:false})
 assert.deepEqual(usageBillingDecision({...event,provider_occurred_at:draft.end_timestamp},[{...draft,status:'FINALIZED'}],now),{timestamp:draft.end_timestamp,adjustment:false,requiresCredit:false})
 assert.throws(()=>usageBillingDecision(event,[{...draft,end_timestamp:'invalid'}],now),/period is invalid/u)
 assert.throws(()=>usageBillingDecision(event,[draft,{...draft,status:'FINALIZED'}],now),/period is ambiguous/u)
})

test('usage billing uses the full native 34-day backdating window without retiming its last day',()=>{
 const now='2026-10-04T00:00:00.000Z',event={kind:'stripe_cost',amount:100,provider_occurred_at:'2026-09-01T00:00:00.000Z'}
 assert.deepEqual(usageBillingDecision(event,[],now),{timestamp:event.provider_occurred_at,adjustment:false,requiresCredit:false})
 const boundary={...event,provider_occurred_at:'2026-08-31T00:00:00.000Z'}
 assert.deepEqual(usageBillingDecision(boundary,[],now),{timestamp:boundary.provider_occurred_at,adjustment:false,requiresCredit:false})
 assert.deepEqual(usageBillingDecision({...event,provider_occurred_at:'2026-08-30T23:59:59.999Z'},[],now),{timestamp:now,adjustment:true,requiresCredit:false})
})

test('Payments usage quantities preserve exact signed USD cents and reject unsupported currency or precision',()=>{
 assert.equal(metronomeCurrencyAmount(10000,'USD'),'10000')
 assert.equal(metronomeCurrencyAmount(-100,'USD'),'-100')
 assert.throws(()=>metronomeCurrencyAmount(1.25,'USD'),/exact integer minor units/u)
 assert.throws(()=>metronomeCurrencyAmount(Number.MAX_SAFE_INTEGER+1,'USD'),/exact integer minor units/u)
 assert.throws(()=>metronomeCurrencyAmount(10000,'THB'),/requires USD cents/u)
})
