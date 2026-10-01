import assert from 'node:assert/strict'
import test from 'node:test'
import {validatePaymentsRateCard} from '../../server/domain/payments/rate-card.ts'
import {metronomeRequest} from '../../server/domain/payments/usage.ts'
import type {CloudflareEnv} from '../../server/utils/auth.ts'
const env={METRONOME_API_KEY:'local_provider_double',METRONOME_RATE_CARD_ID:'card'} as CloudflareEnv
// Explicit primary-contract doubles: never a native rating/collection claim.
test('native rate-card verification rejects a fee rate, currency unit or filter that changes the financial contract',async()=>{
 const original=globalThis.fetch
 let mutation=''
 globalThis.fetch=async(input,init)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):{}
  let data:unknown
  const credit={id:'usd',name:mutation==='units'?'THB':'USD (cents)'}
  if(url.includes('rate-cards/getRates'))data=[{product_id:'volume',entitled:true,rate:{rate_type:'FLAT',price:mutation==='rate'?0.02:0.01337,credit_type:credit}},{product_id:'cost',entitled:true,rate:{rate_type:'FLAT',price:1,credit_type:credit}}]
  else if(url.includes('rate-cards/get'))data={id:'card',fiat_credit_type:credit}
  else if(url.includes('products/get'))data={type:'USAGE',current:{billable_metric_id:body.id}}
  else if(url.includes('billable-metrics/')){const volume=url.endsWith('/volume');data={aggregation_type:'SUM',aggregation_key:'pricing_amount',event_type_filter:{in_values:volume?['payments_captured_volume']:['payments_stripe_cost','payments_stripe_cost_adjustment']},property_filters:[{name:'pricing_amount',exists:true},...(mutation==='filter'?[{name:'merchant_discount',exists:true}]:[])]}}
  else throw new Error(`Unexpected native contract path ${url}`)
  return new Response(JSON.stringify({data}),{status:200})
 }
 try{
  assert.equal((await validatePaymentsRateCard(env)).units,'cents')
  for(const value of ['units','rate','filter']){mutation=value;await assert.rejects(validatePaymentsRateCard(env))}
 }finally{globalThis.fetch=original}
})
test('documented empty successful ingestion response is accepted; configuration reads still require a body',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async()=>new Response(null,{status:200})
 try{assert.deepEqual(await metronomeRequest(env,'/v1/ingest',[]),{});await assert.rejects(metronomeRequest(env,'/v1/customers'))}finally{globalThis.fetch=original}
})
