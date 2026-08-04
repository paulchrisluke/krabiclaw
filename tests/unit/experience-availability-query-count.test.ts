import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Experience } from '../../server/utils/experiences.ts'

// Regression coverage for issue #480's explicit requirement: "Constant availability
// query count for 1, 8, and 25 experiences." attachAvailabilitySummaries
// (server/utils/experiences.ts) previously ran a location lookup plus timezone,
// booking, and override query per experience, serially — query count grew
// linearly with experience count. It now bulk-loads bookings/overrides in a
// single chunked query per 97 experiences (D1's ~100 param limit), so the
// query count must stay flat across 1, 8, and 25 experiences, which all fit
// in one chunk.

let queryAllCallCount = 0

async function queryAll<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T[]> {
  queryAllCallCount += 1
  return [] as T[]
}

// experiences.ts imports the full server/db barrel; only queryAll is actually
// invoked by attachAvailabilitySummaries, but the other named exports must
// still exist for the module's own import bindings to resolve.
async function queryFirst<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T | undefined> {
  throw new Error('queryFirst should not be called by attachAvailabilitySummaries')
}
async function execute(): Promise<unknown> {
  throw new Error('execute should not be called by attachAvailabilitySummaries')
}
async function executeBatch(): Promise<unknown> {
  throw new Error('executeBatch should not be called by attachAvailabilitySummaries')
}

function createDb(): unknown {
  throw new Error('createDb should not be called by attachAvailabilitySummaries')
}
function bindSql(): unknown {
  throw new Error('bindSql should not be called by attachAvailabilitySummaries')
}
function prepareStatement(): unknown {
  throw new Error('prepareStatement should not be called by attachAvailabilitySummaries')
}
async function batchStatements(): Promise<unknown> {
  throw new Error('batchStatements should not be called by attachAvailabilitySummaries')
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll,
    queryFirst,
    execute,
    executeBatch,
    createDb,
    bindSql,
    prepareStatement,
    batchStatements,
    rawClient: {},
    schema: {},
  },
})

const { attachAvailabilitySummaries } = await import('../../server/utils/experiences.ts')

function fakeExperience(index: number): Experience {
  return {
    id: `exp-${index}`,
    organization_id: 'org-1',
    site_id: 'site-1',
    location_id: 'loc-1',
    title: `Experience ${index}`,
    slug: `experience-${index}`,
    tagline: null,
    body: null,
    media: [],
    price: null,
    price_amount: null,
    compare_at_price_amount: null,
    sale_starts_at: null,
    sale_ends_at: null,
    duration_minutes: null,
    max_capacity: null,
    time_slots: null,
    recurring_slots: null,
    available_note: null,
    highlights: [],
    included_items: [],
    what_to_bring: [],
    meeting_point: null,
    status: 'active',
    sort_order: 0,
    featured: false,
    featured_sort_order: 0,
    seo_title: null,
    seo_description: null,
    canonical_url: null,
    robots: null,
    og_image_asset_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const context = {
  locations: [{ id: 'loc-1', special_hours: null, timezone: 'Asia/Bangkok' }],
  defaultTimezone: 'Asia/Bangkok',
}

for (const count of [1, 8, 25]) {
  test(`attachAvailabilitySummaries issues exactly one bulk query for ${count} experiences`, async () => {
    queryAllCallCount = 0
    const list = Array.from({ length: count }, (_, index) => fakeExperience(index))
    const result = await attachAvailabilitySummaries({} as never, 'org-1', 'site-1', list, context)
    assert.equal(result.length, count)
    assert.equal(queryAllCallCount, 1, `expected exactly 1 bulk query for ${count} experiences, got ${queryAllCallCount}`)
  })
}

test('attachAvailabilitySummaries issues zero queries for an empty list', async () => {
  queryAllCallCount = 0
  const result = await attachAvailabilitySummaries({} as never, 'org-1', 'site-1', [], context)
  assert.equal(result.length, 0)
  assert.equal(queryAllCallCount, 0)
})

test('attachAvailabilitySummaries chunks past the ~97-item D1 parameter limit', async () => {
  queryAllCallCount = 0
  const list = Array.from({ length: 150 }, (_, index) => fakeExperience(index))
  await attachAvailabilitySummaries({} as never, 'org-1', 'site-1', list, context)
  assert.equal(queryAllCallCount, 2, 'expected 150 experiences to split into 2 chunks of <=97')
})
