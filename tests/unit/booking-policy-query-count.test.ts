import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Regression coverage for issue #480's explicit requirement: "Constant policy
// query count for 1, 8, and 25 experiences." resolveBookingPolicyIndex
// (server/utils/booking-policies.ts) replaces the old per-target
// resolveBookingPolicy calls with one bulk load of every policy row for a
// site/policy type. Reservation policies are direct per-location records;
// experience policies retain site→location→experience inheritance in memory.
// Query count must stay flat regardless of target count.

let queryAllCallCount = 0
let queryFirstCallCount = 0

async function queryAll<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T[]> {
  queryAllCallCount += 1
  return [] as T[]
}
async function queryFirst<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T | undefined> {
  queryFirstCallCount += 1
  return undefined
}
async function execute(): Promise<unknown> {
  throw new Error('execute should not be called by resolveBookingPolicyIndex')
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll, queryFirst, execute },
})

const { getDirectBookingPolicy, resolveBookingPolicy, resolveBookingPolicyIndex, validateBookingPolicyScope } = await import('../../server/utils/booking-policies.ts')

for (const count of [1, 8, 25]) {
  test(`resolveBookingPolicyIndex issues exactly one bulk query for ${count} experiences`, async () => {
    queryAllCallCount = 0
    queryFirstCallCount = 0
    const experiences = new Map(
      Array.from({ length: count }, (_, index) => [`exp-${index}`, { locationId: 'loc-1' }] as const),
    )
    const index = await resolveBookingPolicyIndex({} as never, {
      siteId: 'site-1',
      policyType: 'experience',
      locations: ['loc-1'],
      experiences,
    })
    assert.equal(index.byExperience.size, count)
    assert.equal(queryAllCallCount, 1, `expected exactly 1 bulk query for ${count} experiences, got ${queryAllCallCount}`)
    assert.equal(queryFirstCallCount, 0)
  })
}

test('resolveBookingPolicyIndex issues exactly one bulk query with no locations or experiences', async () => {
  queryAllCallCount = 0
  queryFirstCallCount = 0
  const index = await resolveBookingPolicyIndex({} as never, { siteId: 'site-1', policyType: 'reservation' })
  assert.equal(index.byLocation.size, 0)
  assert.equal(index.byExperience.size, 0)
  assert.equal(queryAllCallCount, 1)
  assert.equal(queryFirstCallCount, 0)
})

test('reservation policies reject site scope', async () => {
  await assert.rejects(
    getDirectBookingPolicy({} as never, {
      siteId: 'site-1',
      policyType: 'reservation',
      scopeType: 'site',
    }),
    /reservation policies must use location scope/,
  )
})

test('reservation policy scope validation requires a location target', () => {
  assert.throws(
    () => validateBookingPolicyScope({
      policyType: 'reservation',
      scopeType: 'location',
      locationId: null,
    }),
    /location scope requires location_id/,
  )
})

test('an unconfigured location does not receive invented reservation policy values', async () => {
  queryFirstCallCount = 0
  const policy = await resolveBookingPolicy({} as never, {
    siteId: 'site-1',
    policyType: 'reservation',
    locationId: 'location-1',
  })
  assert.equal(queryFirstCallCount, 1)
  assert.equal(policy.id, null)
  assert.equal(policy.location_id, 'location-1')
  assert.equal(policy.free_cancellation_until_minutes, null)
  assert.equal(policy.late_arrival_grace_minutes, null)
  assert.equal(policy.host_confirmation_sla_minutes, null)
  assert.equal(policy.reschedule_allowed, null)
  assert.equal(policy.deposit_required, null)
  assert.equal(policy.special_requests_allowed, null)
})
