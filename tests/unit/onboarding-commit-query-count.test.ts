import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

type Query = { query: string; params?: unknown[] }

let existingRows: Array<Record<string, unknown>> = []
let queryFirstCalls = 0
let queryAllCalls = 0
const batches: Query[][] = []

async function queryFirst() {
  queryFirstCalls += 1
  return { locale: 'en' }
}

async function queryAll() {
  queryAllCalls += 1
  return existingRows
}

async function executeBatch(_db: unknown, queries: Query[]) {
  batches.push(queries)
  return queries.map(() => ({ meta: { changes: 1 } }))
}

async function execute() {
  throw new Error('execute() should not be called by bulk onboarding page replacement')
}

const schema = {}
const createDb = () => {
  throw new Error('createDb() should not be called by bulk onboarding page replacement')
}

mock.module('../../server/db/index.ts', {
  namedExports: { createDb, execute, executeBatch, queryAll, queryFirst, schema },
})

mock.module('../../server/utils/media-asset-manager.ts', {
  namedExports: {
    hydrateMediaAssetRefs: async () => [],
  },
})

mock.module('../../server/utils/billing.ts', {
  namedExports: {
    hasSiteEntitlement: async () => true,
  },
})

mock.module('../../server/utils/site-i18n.ts', {
  namedExports: {
    normalizeLocale: (value: string | null | undefined) => value?.trim().toLowerCase() || 'en',
  },
})

mock.module('../../server/utils/domain-shared.ts', {
  namedExports: {
    normalizeDomain: (value: string) => value.trim().toLowerCase(),
  },
})

mock.module('../../server/utils/public-resource-cache.ts', {
  namedExports: {
    publicResourceCacheInvalidationQuery: (siteId: string, reason: string) => ({
      query: 'INSERT INTO public_resource_cache_invalidations (id, site_id, reason) VALUES (?, ?, ?)',
      params: [crypto.randomUUID(), siteId, reason],
    }),
  },
})

const { applyOnboardingTenantPages } = await import('../../server/utils/tenant-pages.ts')

function row(index: number) {
  const path = index === 0 ? '/' : `/${index === 1 ? 'about' : 'contact'}`
  return {
    variant_id: `variant-${index}`,
    page_id: `page-${index}`,
    organization_id: 'org-1',
    site_id: 'site-1',
    locale: 'en',
    path,
    title: `Page ${index}`,
    summary: null,
    seo_title: null,
    seo_description: null,
    canonical_url: null,
    robots: null,
    page_type: 'system',
    recipe: index === 0 ? 'home' : index === 1 ? 'about' : 'contact',
    sort_order: index,
    document_id: `document-${index}`,
    updated_at: '2026-08-08T00:00:00.000Z',
    document_created_at: '2026-08-08T00:00:00.000Z',
    document_updated_at: '2026-08-08T00:00:00.000Z',
  }
}

function page(index: number) {
  const isHome = index === 0
  return {
    path: isHome ? '/' : `/${index === 1 ? 'about' : 'contact'}`,
    title: isHome ? 'Home' : index === 1 ? 'About' : 'Contact',
    pageType: 'system' as const,
    recipe: isHome ? 'home' : index === 1 ? 'about' : 'contact',
    trustedSystemPage: true,
    blocks: [{ id: `block-${index}`, type: 'hero', position: 0, data: { title: `Page ${index}` } }],
  }
}

async function measure(count: number) {
  existingRows = Array.from({ length: count }, (_, index) => row(index))
  queryFirstCalls = 0
  queryAllCalls = 0
  batches.length = 0
  const result = await applyOnboardingTenantPages({} as never, {
    organizationId: 'org-1',
    siteId: 'site-1',
    userId: 'user-1',
    pages: Array.from({ length: count }, (_, index) => page(index)),
  })
  return {
    result,
    queryFirstCalls,
    queryAllCalls,
    batchCount: batches.length,
    statementCount: batches[0]?.length ?? 0,
  }
}

test('onboarding page replacement keeps D1 reads and batches constant as pages grow', async () => {
  const two = await measure(2)
  const three = await measure(3)

  assert.deepEqual(two.result, { updated: 2, created: 0 })
  assert.deepEqual(three.result, { updated: 3, created: 0 })
  assert.equal(two.queryFirstCalls, 1)
  assert.equal(three.queryFirstCalls, 1)
  assert.equal(two.queryAllCalls, 1)
  assert.equal(three.queryAllCalls, 1)
  assert.equal(two.batchCount, 1)
  assert.equal(three.batchCount, 1)
  assert.ok(two.statementCount < 50, `two-page replacement emitted ${two.statementCount} statements`)
  assert.equal(three.statementCount - two.statementCount, 6)
})

test('onboarding page replacement rejects duplicate normalized paths before D1 reads', async () => {
  existingRows = []
  queryFirstCalls = 0
  queryAllCalls = 0
  batches.length = 0

  await assert.rejects(
    applyOnboardingTenantPages({} as never, {
      organizationId: 'org-1',
      siteId: 'site-1',
      userId: 'user-1',
      pages: [page(0), { ...page(0), path: '//' }],
    }),
    (error: unknown) => Boolean(error && typeof error === 'object' && (error as { statusCode?: unknown }).statusCode === 400),
  )
  assert.equal(queryFirstCalls, 0)
  assert.equal(queryAllCalls, 0)
  assert.equal(batches.length, 0)
})

test('onboarding page replacement rejects an explicitly empty title before batching', async () => {
  existingRows = [row(0)]
  queryFirstCalls = 0
  queryAllCalls = 0
  batches.length = 0

  await assert.rejects(
    applyOnboardingTenantPages({} as never, {
      organizationId: 'org-1',
      siteId: 'site-1',
      userId: 'user-1',
      pages: [{ ...page(0), title: '' }],
    }),
    (error: unknown) => Boolean(error && typeof error === 'object' && (error as { statusCode?: unknown }).statusCode === 400),
  )
  assert.equal(queryFirstCalls, 1)
  assert.equal(queryAllCalls, 1)
  assert.equal(batches.length, 0)
})
