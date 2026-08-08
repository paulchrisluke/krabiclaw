import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyCatalogPlan,
  createCatalogPlan,
  planSha256,
  sha256Json,
} from '../../scripts/lib/stripe-catalog-plan.mjs'
import { parseCanonicalProductOverrides, parseCli } from '../../scripts/seed-stripe.mjs'

const scriptPath = resolve(process.cwd(), 'scripts/seed-stripe.mjs')

test('Stripe catalog seeder requires a reviewed deterministic plan before mutations', () => {
  const source = readFileSync(scriptPath, 'utf8')
  const docs = readFileSync(resolve(process.cwd(), 'docs/operations/stripe-catalog.md'), 'utf8')

  assert.match(source, /--dry-run/)
  assert.match(source, /--apply/)
  assert.match(source, /--plan-file/)
  assert.match(source, /canonical-product/)
  assert.match(source, /sha-256|sha256/i)
  assert.match(source, /test-mode|sk_test|rk_test/i)
  assert.match(docs, /canonical-product growth=prod_/)
  assert.match(docs, /canonicalProductIds/)
})

test('canonical product CLI overrides are repeatable, normalized, and validated before provider access', () => {
  assert.deepEqual(
    parseCanonicalProductOverrides(['managed=prod-managed', 'growth=prod-growth']),
    { growth: 'prod-growth', managed: 'prod-managed' },
  )
  assert.deepEqual(
    parseCli(['--dry-run', '--canonical-product', 'managed=prod-managed', '--canonical-product', 'growth=prod-growth']).canonicalProductIds,
    { growth: 'prod-growth', managed: 'prod-managed' },
  )
  assert.throws(
    () => parseCanonicalProductOverrides(['unknown=prod-unknown']),
    /unsupported plan ID.*unknown/,
  )
  assert.throws(
    () => parseCanonicalProductOverrides(['growth=prod-a', 'growth=prod-b']),
    /Duplicate --canonical-product override for plan growth/,
  )
  assert.throws(
    () => parseCanonicalProductOverrides(['growth=prod-a=prod-b']),
    /exact plan_id=prod_id format/,
  )
  assert.throws(
    () => parseCli(['--apply', '--plan-file', '.tmp/plan.json', '--confirm-sha256', 'a'.repeat(64), '--canonical-product', 'growth=prod-growth']),
    /only valid when generating a catalog plan/,
  )
})

function fakeCatalog() {
  const products = [
    {
      id: 'prod-legacy',
      active: true,
      name: 'Legacy plan',
      description: 'Retired',
      metadata: { plan_id: 'legacy' },
      default_price: null,
      images: [],
    },
    {
      id: 'prod-growth',
      active: true,
      name: 'Growth',
      description: 'Old description',
      metadata: { plan_id: 'growth' },
      default_price: 'price-growth-old',
      images: [],
    },
  ]
  const prices = {
    'prod-growth': [{
      id: 'price-growth-old',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 3900,
      recurring: { interval: 'month', interval_count: 1 },
    }],
  }
  return { products, prices }
}

function duplicateGrowthCatalog() {
  const catalog = fakeCatalog()
  catalog.products.splice(1, 1,
    {
      id: 'prod-growth-a',
      active: true,
      name: 'Growth (legacy)',
      description: 'Old description',
      metadata: { plan_id: 'growth' },
      default_price: 'price-growth-a',
      images: [],
    },
    {
      id: 'prod-growth-b',
      active: true,
      name: 'Growth (canonical)',
      description: 'Current description',
      metadata: { plan_id: 'growth' },
      default_price: 'price-growth-b',
      images: [],
    },
  )
  catalog.prices = {
    'prod-growth-a': [
      {
        id: 'price-growth-a',
        product: 'prod-growth-a',
        active: true,
        type: 'recurring',
        currency: 'usd',
        unit_amount: 4900,
        recurring: { interval: 'month', interval_count: 1 },
      },
      {
        id: 'price-growth-a-year',
        product: 'prod-growth-a',
        active: true,
        type: 'recurring',
        currency: 'usd',
        unit_amount: 49000,
        recurring: { interval: 'year', interval_count: 1 },
      },
    ],
    'prod-growth-b': [{
      id: 'price-growth-b',
      product: 'prod-growth-b',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 4900,
      recurring: { interval: 'month', interval_count: 1 },
    }],
  }
  return catalog
}

function fakeReadAdapter(catalog, writes = []) {
  return {
    products: {
      list: async () => ({ data: catalog.products, has_more: false }),
      create: async params => { writes.push(['products.create', params]); return { id: 'unexpected-product' } },
      update: async (id, params) => { writes.push(['products.update', id, params]); return { id } },
    },
    prices: {
      list: async ({ product }) => ({ data: catalog.prices[product] ?? [], has_more: false }),
      create: async params => { writes.push(['prices.create', params]); return { id: 'unexpected-price' } },
      update: async (id, params) => { writes.push(['prices.update', id, params]); return { id } },
    },
  }
}

function noWriteAdapter(writes) {
  return {
    products: {
      create: async params => { writes.push(['products.create', params]); return { id: 'unexpected-product' } },
      update: async (id, params) => { writes.push(['products.update', id, params]); return { id } },
    },
    prices: {
      create: async params => { writes.push(['prices.create', params]); return { id: 'unexpected-price' } },
      update: async (id, params) => { writes.push(['prices.update', id, params]); return { id } },
    },
  }
}

test('dry-run uses injected read/files adapters and performs zero writes with a deterministic hash', async () => {
  const catalog = fakeCatalog()
  const writes = []
  const fileCalls = []
  const imageFiles = {
    growth: {
      path: 'scripts/assets/stripe/growth.png',
      exists: true,
      sha256: 'a'.repeat(64),
      mimeType: 'image/png',
      fileName: 'growth.png',
    },
    managed: {
      path: 'scripts/assets/stripe/managed.png',
      exists: true,
      sha256: 'b'.repeat(64),
      mimeType: 'image/png',
      fileName: 'managed.png',
    },
  }
  const filesAdapter = {
    describeImageFiles: async () => { fileCalls.push('describe'); return imageFiles },
    uploadProductImage: async operation => { fileCalls.push(['upload', operation]); return 'unexpected' },
  }
  const readAdapter = fakeReadAdapter(catalog, writes)
  const planA = await createCatalogPlan({ readAdapter, filesAdapter, accountMode: 'test' })
  const planB = await createCatalogPlan({ readAdapter, filesAdapter, accountMode: 'test' })

  assert.deepEqual(planA, planB)
  assert.equal(planA.planSha256, planSha256(planA))
  assert.equal(planA.providerSnapshotSha256, sha256Json(planA.providerSnapshot))
  assert.deepEqual(fileCalls, ['describe', 'describe'])
  assert.deepEqual(
    planA.operations.filter(operation => operation.type === 'upload_product_image').map(operation => operation.planId),
    ['growth', 'managed'],
  )
  assert.equal(writes.length, 0)
})

test('duplicate active products fail closed and identify every product without mutations', async () => {
  const catalog = duplicateGrowthCatalog()
  const writes = []

  await assert.rejects(
    () => createCatalogPlan({
      readAdapter: fakeReadAdapter(catalog, writes),
      imageFiles: {},
      accountMode: 'test',
    }),
    /multiple active products for plan growth[\s\S]*prod-growth-a[\s\S]*prod-growth-b[\s\S]*--canonical-product growth=<product-id>/,
  )
  assert.equal(writes.length, 0)
})

test('explicit canonical product selection signs deterministic duplicate cleanup operations', async () => {
  const catalog = duplicateGrowthCatalog()
  const options = {
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
    canonicalProductIds: { growth: 'prod-growth-b' },
  }
  const planA = await createCatalogPlan(options)
  const planB = await createCatalogPlan(options)

  assert.deepEqual(planA, planB)
  assert.equal(planA.planSha256, planSha256(planA))
  assert.equal(planA.canonicalProductIds.growth, 'prod-growth-b')
  assert.deepEqual(
    planA.operations
      .filter(operation => operation.type === 'deactivate_price' && operation.productId === 'prod-growth-a')
      .map(operation => operation.priceId),
    ['price-growth-a', 'price-growth-a-year'],
  )
  assert.deepEqual(
    planA.operations
      .filter(operation => operation.type === 'archive_product' && operation.productId === 'prod-growth-a')
      .map(operation => operation.expected.id),
    ['prod-growth-a'],
  )
  const growthUpdates = planA.operations.filter(operation => operation.type === 'update_product' && operation.product?.id === 'prod-growth-b')
  assert.equal(growthUpdates.length, 1)

  const writes = []
  await applyCatalogPlan({
    plan: planA,
    confirmedSha256: planA.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: noWriteAdapter(writes),
    filesAdapter: {},
  })
  assert.deepEqual(
    writes.filter(([type, id]) => type === 'prices.update' && ['price-growth-a', 'price-growth-a-year'].includes(id)),
    [
      ['prices.update', 'price-growth-a', { active: false }],
      ['prices.update', 'price-growth-a-year', { active: false }],
    ],
  )
  assert.deepEqual(
    writes.filter(([type, id]) => type === 'products.update' && id === 'prod-growth-a'),
    [['products.update', 'prod-growth-a', { active: false }]],
  )
})

test('canonical product overrides validate plan IDs, active membership, and duplicate declarations', async () => {
  const catalog = duplicateGrowthCatalog()
  const readAdapter = fakeReadAdapter(catalog)

  await assert.rejects(
    () => createCatalogPlan({ readAdapter, imageFiles: {}, canonicalProductIds: { unknown: 'prod-growth-b' } }),
    /unsupported plan ID.*unknown/,
  )
  await assert.rejects(
    () => createCatalogPlan({ readAdapter, imageFiles: {}, canonicalProductIds: { growth: 'prod-missing' } }),
    /growth=prod-missing.*active product/,
  )
  await assert.rejects(
    () => createCatalogPlan({ readAdapter, imageFiles: {}, canonicalProductIds: { growth: 'prod-legacy' } }),
    /growth=prod-legacy.*plan_id=growth/,
  )
})

test('apply rejects hash mismatch, snapshot drift, and live keys before any writes', async () => {
  const catalog = fakeCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const writes = []
  const mutations = noWriteAdapter(writes)
  const files = { verifyProductImage: async () => { throw new Error('should not verify') } }

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: '0'.repeat(64),
      key: 'sk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: mutations,
      filesAdapter: files,
    }),
    /confirmation does not match/,
  )
  assert.equal(writes.length, 0)

  const unsupported = {
    ...plan,
    operations: [...plan.operations, { type: 'delete_everything' }],
  }
  unsupported.planSha256 = planSha256(unsupported)
  await assert.rejects(
    () => applyCatalogPlan({
      plan: unsupported,
      confirmedSha256: unsupported.planSha256,
      key: 'sk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: mutations,
      filesAdapter: files,
    }),
    /Unsupported Stripe catalog operation/,
  )
  assert.equal(writes.length, 0)

  const drifted = fakeCatalog()
  drifted.products[1].description = 'Drifted after review'
  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'sk_test_fake',
      readAdapter: fakeReadAdapter(drifted),
      mutationAdapter: mutations,
      filesAdapter: files,
    }),
    /Provider snapshot drift detected/,
  )
  assert.equal(writes.length, 0)

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'sk_live_fake',
      readAdapter: { products: { list: async () => { throw new Error('live read must not run') } }, prices: { list: async () => { throw new Error('live read must not run') } } },
      mutationAdapter: mutations,
      filesAdapter: files,
    }),
    /test-mode key/,
  )
  assert.equal(writes.length, 0)
})

test('valid test-mode apply performs only the reviewed operations', async () => {
  const catalog = fakeCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const writes = []
  const mutations = {
    products: {
      create: async params => {
        writes.push(['products.create', params])
        return { id: `created-${params.metadata.plan_id}` }
      },
      update: async (id, params) => {
        writes.push(['products.update', id, params])
        return { id }
      },
    },
    prices: {
      create: async params => {
        writes.push(['prices.create', params])
        return { id: `created-price-${params.product}` }
      },
      update: async (id, params) => {
        writes.push(['prices.update', id, params])
        return { id }
      },
    },
  }
  const result = await applyCatalogPlan({
    plan,
    confirmedSha256: plan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: mutations,
    filesAdapter: {},
  })

  assert.equal(result.appliedOperations, plan.operations.length)
  assert.equal(writes.length, plan.operations.length)
  assert.deepEqual(writes.map(([type]) => type), plan.operations.map(operation => ({
    archive_product: 'products.update',
    create_product: 'products.create',
    create_price: 'prices.create',
    deactivate_price: 'prices.update',
    update_product: 'products.update',
  }[operation.type])))
  assert.ok(writes.some(([type, id]) => type === 'products.update' && id === 'prod-legacy'))
  assert.ok(writes.some(([type, params]) => type === 'products.create' && params.metadata.plan_id === 'managed'))
  const prices = writes
    .filter(([type]) => type === 'prices.create')
    .map(([, params]) => [params.product, params.unit_amount])
  assert.deepEqual(prices, [
    ['prod-growth', 4900],
    ['created-managed', 14900],
    ['created-seo_accelerator', 34900],
  ])
})
