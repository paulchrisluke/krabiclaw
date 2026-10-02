import assert from 'node:assert/strict'
import test from 'node:test'
import {getPlanEntitlements} from '../../server/utils/billing-entitlements.ts'
test('new Payments acceptance is never silently granted to current tiers',()=>{
 for(const plan of ['free','growth'])assert.equal(getPlanEntitlements(plan).payments,false)
 for(const historical of ['basic','starter'])assert.throws(()=>getPlanEntitlements(historical))
})
