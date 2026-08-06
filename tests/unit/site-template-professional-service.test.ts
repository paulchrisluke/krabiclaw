import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Same mock.module pattern as tests/unit/content-documents.test.ts and
// tests/unit/guest-claims.test.ts: intercept server/db/index.ts's executeBatch
// so seedNewSite (server/utils/site-template.ts) can be exercised without a
// real D1 binding, while capturing every statement it issues for assertions.
type Batch = { query: string; params: unknown[] }

const capturedBatches: Batch[][] = []

async function executeBatch(_db: unknown, queries: Batch[]) {
  capturedBatches.push(queries)
  return queries.map(() => ({ meta: { changes: 1 } }))
}

async function queryFirst<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T | undefined> {
  // seedNewSite only reads to check for an existing "main" location on resume —
  // every test here seeds a brand-new site, so there is never an existing row.
  return undefined
}

async function execute() {
  throw new Error('execute() should not be called directly by seedNewSite')
}

async function queryAll() {
  throw new Error('queryAll() should not be called by seedNewSite')
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryFirst, queryAll },
})

const { seedNewSite } = await import('../../server/utils/site-template.ts')

// Restaurant/experience-specific words that must never leak into a
// professional-service seed — see the Pottery House Krabi regression case.
const BANNED_WORDS = ['menu', 'dish', 'kitchen', 'dine', 'dining', 'reservation', 'table', 'class', 'workshop', 'studio', 'chef']

function flattenBatch(batch: Batch[]): string {
  return batch.map(b => `${b.query} ${JSON.stringify(b.params)}`).join(' \n ').toLowerCase()
}

test('seedNewSite creates no menu/menu_items rows for professional_service', async () => {
  capturedBatches.length = 0
  await seedNewSite({} as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'Acme Legal Group',
    vertical: 'professional_service',
  })

  assert.equal(capturedBatches.length, 1)
  const batch = capturedBatches[0]!
  const menuInserts = batch.filter(b => /INSERT[\s\S]*INTO menus\b/i.test(b.query) || /INSERT[\s\S]*INTO menu_items\b/i.test(b.query))
  assert.equal(menuInserts.length, 0, 'expected no menus/menu_items inserts for professional_service')
})

test('seedNewSite professional_service copy has no restaurant/experience leakage', async () => {
  capturedBatches.length = 0
  await seedNewSite({} as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'Acme Legal Group',
    vertical: 'professional_service',
  })

  const haystack = flattenBatch(capturedBatches[0]!)
  for (const banned of BANNED_WORDS) {
    const wordBoundary = new RegExp(`\\b${banned}\\b`, 'i')
    assert.ok(!wordBoundary.test(haystack), `expected professional_service seed copy to omit "${banned}"`)
  }
  assert.ok(haystack.includes('talk with our team'))
})

test('seedNewSite still seeds a menu for restaurant (regression guard)', async () => {
  capturedBatches.length = 0
  await seedNewSite({} as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    name: 'Test Cafe',
    vertical: 'restaurant',
  })

  const batch = capturedBatches[0]!
  const menuInserts = batch.filter(b => /INSERT[\s\S]*INTO menus\b/i.test(b.query))
  assert.ok(menuInserts.length > 0, 'expected restaurant seeding to still create a menu')
})
