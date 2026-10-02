import assert from 'node:assert/strict'
import test from 'node:test'
import {metronomeRequest,provisionPaymentsBilling} from '../../server/domain/payments/usage.ts'
import type {AppDb} from '../../server/db/index.ts'
import type Stripe from 'stripe'
import type {CloudflareEnv} from '../../server/utils/auth.ts'

test('native Metronome ingest accepts empty or JSON-null success without weakening financial reads',async(t)=>{
 const env={METRONOME_API_KEY:'local-provider-boundary-only'} as CloudflareEnv
 let body='null',status=200
 t.mock.method(globalThis,'fetch',async()=>new Response(body,{status}))
 for(const accepted of ['', 'null', '{}']){
  body=accepted
  assert.deepEqual(await metronomeRequest(env,'/v1/ingest',[]),{})
 }
 body='null'
 await assert.rejects(()=>metronomeRequest(env,'/v2/contracts/list',{}),/response is invalid/u)
 body='[]'
 await assert.rejects(()=>metronomeRequest(env,'/v1/ingest',[]),/response is invalid/u)
 status=400;body='{"message":"invalid usage"}'
 await assert.rejects(()=>metronomeRequest(env,'/v1/ingest',[]),/request failed \(400\)/u)
})

test('a persisted contract does not bypass native billing configuration validation',async()=>{
 const db={$client:{},get:async()=>({organization_id:'org',metronome_contract_id:'existing-contract'})} as unknown as AppDb
 await assert.rejects(()=>provisionPaymentsBilling(db,{} as Stripe,{} as CloudflareEnv,{organizationId:'org',userId:'owner',role:'owner'}),/Payments USD Metronome rate card must be configured/u)
})
