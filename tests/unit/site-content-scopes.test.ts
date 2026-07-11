import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'

interface Call {
  query: string
  params: unknown[]
}

const calls = {
  execute: [] as Call[],
  batch: [] as Array<Array<{ query: string; params?: unknown[] }>>,
  rows: [] as Array<Record<string, unknown>>,
  validCount: 2,
}

async function execute(_db: unknown, query: string, params: unknown[] = []) {
  calls.execute.push({ query, params })
  return { meta: { changes: 1 } }
}

async function executeBatch(_db: unknown, queries: Array<{ query: string; params?: unknown[] }>) {
  calls.batch.push(queries)
  return queries.map(() => ({ meta: { changes: 1 } }))
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  calls.execute.push({ query, params })
  return calls.rows as T[]
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T> {
  calls.execute.push({ query, params })
  return { valid_count: calls.validCount } as T
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const { createQa, listQa, reorderQa } = await import('../../server/utils/location-qa.ts')
const { createOwnerEnteredSiteReview, listSiteReviews, updateOwnerEnteredSiteReview } = await import('../../server/utils/site-reviews.ts')

function resetCalls() {
  calls.execute = []
  calls.batch = []
  calls.rows = []
  calls.validCount = 2
}

const db = {} as D1Database
const qaScope = { organizationId: 'org-1', siteId: 'site-1', locationId: null }

test('site Q&A writes a null location and site queries exclude location records', async () => {
  resetCalls()
  const created = await createQa(db, qaScope, { question: 'Can you help?', answer: 'Yes.' })
  assert.equal(created.status, 201)
  const insert = calls.execute.find(call => call.query.includes('INSERT INTO location_qa'))
  assert.ok(insert)
  assert.equal(insert.params[3], null)

  resetCalls()
  await listQa(db, 'site-1', null, true)
  const query = calls.execute[0]
  assert.ok(query)
  assert.match(query.query, /site_id = \? AND location_id IS NULL AND status = 'published'/)
  assert.deepEqual(query.params, ['site-1'])
})

test('site Q&A reorder validates scope and writes atomically', async () => {
  resetCalls()
  const result = await reorderQa(db, qaScope, [
    { id: 'qa-1', sort_order: 2 },
    { id: 'qa-2', sort_order: 1 },
  ])
  assert.equal(result.updated, 2)
  assert.equal(calls.batch.length, 1)
  assert.equal(calls.batch[0]?.length, 2)
  assert.match(calls.batch[0]?.[0]?.query ?? '', /organization_id = \? AND site_id = \? AND location_id IS NULL/)
})

test('owner-entered reviews require authorization, provenance, and a 1-5 rating', async () => {
  resetCalls()
  const base = {
    author_name: 'Client',
    rating: 5,
    content: 'Thoughtful and practical support.',
    collection_method: 'in_person',
    publication_authorized: true,
  }
  await assert.rejects(
    () => createOwnerEnteredSiteReview(db, { organizationId: 'org-1', siteId: 'site-1', enteredByUserId: 'user-1' }, { ...base, publication_authorized: false }),
    /explicitly accepted/,
  )
  await assert.rejects(
    () => createOwnerEnteredSiteReview(db, { organizationId: 'org-1', siteId: 'site-1', enteredByUserId: 'user-1' }, { ...base, rating: 6 }),
    /1 through 5/,
  )

  const created = await createOwnerEnteredSiteReview(
    db,
    { organizationId: 'org-1', siteId: 'site-1', enteredByUserId: 'user-1' },
    base,
  )
  assert.equal(created.verified, false)
  const insert = calls.execute.find(call => call.query.includes('INSERT INTO reviews'))
  assert.ok(insert)
  assert.match(insert.query, /location_id.*owner_entered/s)
  assert.ok(insert.params.includes('user-1'))
  assert.ok(insert.params.includes('in_person'))
})

test('owner-entered review updates stay site-scoped and cannot revoke authorization', async () => {
  resetCalls()
  await assert.rejects(
    () => updateOwnerEnteredSiteReview(db, { organizationId: 'org-1', siteId: 'site-1' }, 'review-1', { publication_authorized: false }),
    /cannot be revoked/,
  )
  await updateOwnerEnteredSiteReview(db, { organizationId: 'org-1', siteId: 'site-1' }, 'review-1', { rating: 4 })
  const update = calls.execute.at(-1)
  assert.ok(update)
  assert.match(update.query, /location_id IS NULL AND source = 'owner_entered'/)
  assert.deepEqual(update.params.slice(-3), ['review-1', 'org-1', 'site-1'])
})

test('only directly collected review-request feedback is marked verified', async () => {
  resetCalls()
  calls.rows = [
    { id: 'direct', source: 'direct', review_request_id: 'request-1', publication_authorized: 0 },
    { id: 'manual', source: 'owner_entered', review_request_id: null, publication_authorized: 1 },
    { id: 'google', source: 'google', review_request_id: null, publication_authorized: 0 },
  ]
  const reviews = await listSiteReviews(db, 'site-1')
  assert.match(calls.execute.at(-1)?.query ?? '', /SELECT[\s\S]*location_id[\s\S]*FROM reviews/)
  assert.equal(reviews[0]?.verified, true)
  assert.equal(reviews[1]?.verified, false)
  assert.equal(reviews[2]?.verified, false)
})

test('migration preserves old review rows while adding provenance defaults', () => {
  const sql = readFileSync('migrations/0042_fixed_master_chief.sql', 'utf8')
  assert.match(sql, /SELECT "id"[\s\S]+"source", NULL, NULL, NULL, NULL, 0, "ip_hash"/)
  assert.match(sql, /reviews_owner_entered_provenance_check/)
  assert.match(sql, /idx_location_qa_site/)
  assert.match(sql, /tenant_redirects_redirect_to_path_check/)
})
