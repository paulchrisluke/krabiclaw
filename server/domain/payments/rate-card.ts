import type {CloudflareEnv} from '~/server/utils/auth'
import {metronomeRequest} from './usage'
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Metronome billing configuration shape is invalid');return value as Record<string,unknown>}
/** Verify configured native billing instead of trusting a rate-card ID or name. */
export async function validatePaymentsRateCard(env:CloudflareEnv,at=new Date().toISOString()) {
 if(!env.METRONOME_RATE_CARD_ID)throw new Error('Payments Metronome rate card missing')
 const card=record((await metronomeRequest(env,'/v1/contract-pricing/rate-cards/get',{id:env.METRONOME_RATE_CARD_ID})).data)
 const credit=record(card.fiat_credit_type)
 if(credit.name!=='USD (cents)'||card.archived_at)throw new Error('Payments requires an active USD-cents native rate card')
 const result=await metronomeRequest(env,'/v1/contract-pricing/rate-cards/getRates?limit=100',{rate_card_id:env.METRONOME_RATE_CARD_ID,at})
 if(result.next_page||!Array.isArray(result.data)||result.data.length!==2)throw new Error('Payments rate card must contain exactly captured-volume and attributable-cost rates')
 const expected=new Set(['payments_captured_volume','payments_stripe_cost'])
 for(const value of result.data){
  const schedule=record(value),rate=record(schedule.rate)
  if(schedule.entitled!==true||String(rate.rate_type).toUpperCase()!=='FLAT'||rate.minimum_config||rate.tiers||rate.custom_rate||schedule.commit_rate||schedule.pricing_group_values)throw new Error('Payments requires flat usage rates without minimums, overrides or pricing groups')
  const rateCredit=record(rate.credit_type)
  if(rateCredit.id!==credit.id)throw new Error('Payments rate currency units do not match USD cents')
  const product=record((await metronomeRequest(env,'/v1/contract-pricing/products/get',{id:schedule.product_id})).data),current=record(product.current)
  if(product.type!=='USAGE'||product.archived_at||current.quantity_conversion||current.quantity_rounding||current.pricing_group_key)throw new Error('Payments products must preserve exact unrounded usage quantities')
  if(typeof current.billable_metric_id!=='string')throw new Error('Payments usage product metric is missing')
  const metric=record((await metronomeRequest(env,`/v1/billable-metrics/${encodeURIComponent(current.billable_metric_id)}`)).data),filter=record(metric.event_type_filter)
  const events=Array.isArray(filter.in_values)?filter.in_values:[]
  const volume=events.length===1&&events[0]==='payments_captured_volume'
  const cost=events.length===2&&events.includes('payments_stripe_cost')&&events.includes('payments_stripe_cost_adjustment')
  const kind=volume?'payments_captured_volume':cost?'payments_stripe_cost':null
  if(!kind||!expected.delete(kind)||metric.archived_at||metric.sql||String(metric.aggregation_type).toUpperCase()!=='SUM'||metric.aggregation_key!=='pricing_amount'||filter.not_in_values||(Array.isArray(metric.group_keys)&&metric.group_keys.length))throw new Error('Payments metric must sum exact pricing_amount for the designated native event types')
  if(rate.price!==(volume?0.01337:1))throw new Error('Payments rate must be 1.337% captured volume or actual cost at 1:1')
  if(!Array.isArray(metric.property_filters)||!metric.property_filters.some(value=>record(value).name==='pricing_amount'&&record(value).exists===true))throw new Error('Payments aggregation property must exist')
  for(const value of metric.property_filters){const f=record(value);if(f.name==='pricing_amount'&&Object.keys(f).every(key=>['name','exists'].includes(key))&&f.exists===true)continue;if(f.name==='currency'&&f.exists===true&&Array.isArray(f.in_values)&&f.in_values.length===1&&f.in_values[0]==='USD'&&Object.keys(f).every(key=>['name','exists','in_values'].includes(key)))continue;throw new Error('Payments metric contains an unverified filter that could omit attributable usage')}
 }
 return {rate_card_id:card.id,currency:'USD',units:'cents',validated_at:at}
}
