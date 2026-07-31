import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Regression coverage for issue #480's explicit requirement: "Constant policy
// query count for 1, 8, and 25 experiences." resolveBookingPolicyIndex
// (server/utils/booking-policies.ts) replaces the old per-target
// resolveBookingPolicy calls (2 site-default statements + 2 per location + 3
// per experience) with one bulk load of every policy row for a site/policy
// type, then resolves site→location→experience inheritance in memory — query
// count must stay flat regardless of how many locations/experiences are
// requested.

let queryAllCallCount = 0

async function queryAll<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T[]> {
  queryAllCallCount += 1
  return [] as T[]
}
async function queryFirst<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T | undefined> {
  throw new Error('queryFirst should not be called by resolveBookingPolicyIndex')
}
async function execute(): Promise<unknown> {
  throw new Error('execute should not be called by resolveBookingPolicyIndex')
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll, queryFirst, execute },
})

const { resolveBookingPolicyIndex } = await import('../../server/utils/booking-policies.ts')

for (const count of [1, 8, 25]) {
  test(`resolveBookingPolicyIndex issues exactly one bulk query for ${count} experiences`, async () => {
    queryAllCallCount = 0
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
  })
}

test('resolveBookingPolicyIndex issues exactly one bulk query with no locations or experiences', async () => {
  queryAllCallCount = 0
  const index = await resolveBookingPolicyIndex({} as never, { siteId: 'site-1', policyType: 'reservation' })
  assert.equal(index.byLocation.size, 0)
  assert.equal(index.byExperience.size, 0)
  assert.equal(queryAllCallCount, 1)
})
