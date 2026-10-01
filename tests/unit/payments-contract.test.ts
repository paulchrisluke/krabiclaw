import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {createStripeClient} from '../../server/utils/stripe-client.ts'
import {getPlanEntitlements} from '../../server/utils/billing-entitlements.ts'
import {STRIPE_API_VERSION,STRIPE_PAYMENTS_API_VERSION,STRIPE_WEBHOOK_API_VERSION} from '../../shared/stripe-contract.ts'
test('one native client factory isolates Express preview from canonical subscription calls',()=>{
 assert.equal(createStripeClient('sk_test_local_contract').getApiField('version'),STRIPE_API_VERSION)
 assert.equal(createStripeClient('sk_test_local_contract','payments').getApiField('version'),STRIPE_PAYMENTS_API_VERSION)
 assert.equal(STRIPE_API_VERSION,'2026-08-26.dahlia')
 assert.equal(STRIPE_PAYMENTS_API_VERSION,'2026-09-30.preview')
 assert.equal(STRIPE_WEBHOOK_API_VERSION,'2025-11-17.clover')
 const roots=['server/api/dashboard/connect','server/api/dashboard/payments','server/api/stripe/connect','server/api/stripe/payments','server/api/account']
 const files=roots.flatMap(root=>readdirSync(root).filter(name=>name.endsWith('.ts')).map(name=>join(root,name)))
 files.push('server/tasks/payments-reconcile.ts','server/tasks/stripe-webhook-retry.ts','server/utils/mcp-executor/payments.ts','server/domain/product-bookings.ts')
 for(const file of files){const source=readFileSync(file,'utf8');for(const call of source.matchAll(/createStripeClient\(([^)]*)\)/gu))assert.match(call[1]!,/,'payments'|, 'payments'/u,file)}
 for(const file of ['server/utils/auth.ts','server/utils/billing.ts'])assert.doesNotMatch(readFileSync(file,'utf8'),/createStripeClient\([^)]*payments/u)
})
test('new Payments acceptance is never silently granted to current tiers',()=>{
 for(const plan of ['free','growth'])assert.equal(getPlanEntitlements(plan).payments,false)
 for(const historical of ['basic','starter'])assert.throws(()=>getPlanEntitlements(historical))
})
