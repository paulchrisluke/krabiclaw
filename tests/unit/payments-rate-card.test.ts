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
test('ingestion acknowledgements and financial read errors retain their distinct provider contracts',async(t)=>{
 let body='',status=200
 t.mock.method(globalThis,'fetch',async()=>new Response(body,{status}))
 for(const value of ['', 'null', '{}']){body=value;assert.deepEqual(await metronomeRequest(env,'/v1/ingest',[]),{})}
 body='null';await assert.rejects(metronomeRequest(env,'/v1/customers'),/response is invalid/u)
 body='[]';await assert.rejects(metronomeRequest(env,'/v1/ingest',[]),/response is invalid/u)
 status=400;body=JSON.stringify({message:`Invalid pricing_amount for buyer@example.com; Bearer hidden-token; ${env.METRONOME_API_KEY}; https://private.example/customer`})
 await assert.rejects(metronomeRequest(env,'/v1/ingest',[]),(error:unknown)=>{
  const failure=error as {message:string;data:{provider_status:number}}
  assert.equal(failure.data.provider_status,400)
  assert.match(failure.message,/Invalid pricing_amount/u)
  for(const privateValue of ['buyer@example.com','hidden-token',env.METRONOME_API_KEY,'https://private.example'])assert.equal(failure.message.includes(privateValue),false)
  return true
 })
})
