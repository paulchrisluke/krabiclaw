import test from 'node:test'
import assert from 'node:assert/strict'
import { linkSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  applyCatalogPlan,
  createCatalogPlan,
  PLAN_DEFINITIONS,
  planSha256,
  sha256Json,
} from '../../scripts/lib/stripe-catalog-plan.mjs'
import { createStripeClient, main, parseCanonicalProductOverrides, parseCli } from '../../scripts/seed-stripe.mjs'
import { getBetterAuthStripePlans } from '../../server/utils/better-auth-stripe.ts'

const scriptPath = resolve(process.cwd(), 'scripts/seed-stripe.mjs')

function journalPath(label = 'apply') {
  return join(mkdtempSync(join(tmpdir(), 'stripe-catalog-test-')), `${label}.json`)
}

test('Stripe catalog seeder requires a reviewed deterministic plan before mutations', () => {
  const source = readFileSync(scriptPath, 'utf8')
  const docs = readFileSync(resolve(process.cwd(), 'docs/operations/stripe-catalog.md'), 'utf8')

  assert.match(source, /--dry-run/)
  assert.match(source, /--apply/)
  assert.match(source, /--plan-file/)
  assert.match(source, /canonical-product/)
  assert.match(source, /retirement-only/)
  assert.match(source, /sha-256|sha256/i)
  assert.match(source, /test-mode|sk_test|rk_test/i)
  assert.match(source, /journal-file/)
  assert.match(docs, /status=incomplete/)
  assert.match(docs, /zero remaining operations/)
  assert.match(docs, /canonical-product growth=prod_/)
  assert.match(docs, /canonicalProductIds/)
})

test('canonical product CLI overrides are repeatable, normalized, and validated before provider access', () => {
  assert.deepEqual(
    parseCanonicalProductOverrides(['growth=prod-growth']),
    { growth: 'prod-growth' },
  )
  assert.equal(parseCli(['--dry-run', '--retirement-only']).retirementOnly, true)
  assert.deepEqual(
    parseCli(['--dry-run', '--canonical-product', 'growth=prod-growth']).canonicalProductIds,
    { growth: 'prod-growth' },
  )
  assert.throws(
    () => parseCanonicalProductOverrides(['managed=prod-managed']),
    /unsupported plan ID.*managed/,
  )
  assert.throws(
    () => parseCanonicalProductOverrides(['seo_accelerator=prod-seo']),
    /unsupported plan ID.*seo_accelerator/,
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
  assert.throws(
    () => parseCli(['--apply', '--plan-file', '.tmp/plan.json', '--confirm-sha256', 'a'.repeat(64)]),
    /requires an explicit --journal-file/,
  )
  assert.equal(
    parseCli(['--apply', '--plan-file', '.tmp/plan.json', '--confirm-sha256', 'a'.repeat(64), '--journal-path', '.tmp/catalog-journal.json']).journalFile,
    resolve('.tmp/catalog-journal.json'),
  )
  assert.throws(
    () => parseCli(['--apply', '--plan-file', '.tmp/plan.json', '--confirm-sha256', 'a'.repeat(64), '--journal-file', '.tmp/plan.json']),
    /must be different files/,
  )
  assert.throws(
    () => parseCli(['--apply', '--retirement-only', '--plan-file', '.tmp/plan.json', '--confirm-sha256', 'a'.repeat(64), '--journal-file', '.tmp/journal.json']),
    /--retirement-only is only valid when generating/,
  )

  const aliases = mkdtempSync(join(tmpdir(), 'stripe-catalog-alias-test-'))
  const planPath = join(aliases, 'plan.json')
  const journalAliasPath = join(aliases, 'journal.json')
  writeFileSync(planPath, '{}\n')
  linkSync(planPath, journalAliasPath)
  assert.throws(
    () => parseCli([
      '--apply',
      '--plan-file', planPath,
      '--confirm-sha256', 'a'.repeat(64),
      '--journal-file', journalAliasPath,
    ]),
    /must be different files/,
  )
})

test('catalog preflight requires test mode before constructing the Stripe client', async () => {
  assert.equal(parseCli(['--dry-run', '--require-test-mode']).requireTestMode, true)
  let constructed = false
  await assert.rejects(
    () => main(['--dry-run', '--require-test-mode'], {
      secretKey: 'sk_live_fake',
      stripeFactory: () => {
        constructed = true
        throw new Error('provider construction should not be reached')
      },
    }),
    /test-mode key/,
  )
  assert.equal(constructed, false)
})

test('Stripe catalog provider reads use zero retries and the explicit ten-second timeout', () => {
  let captured
  function FakeStripe(secretKey, options) {
    captured = { secretKey, options }
  }
  createStripeClient('rk_test_fake', FakeStripe)
  assert.deepEqual(captured, {
    secretKey: 'rk_test_fake',
    options: { maxNetworkRetries: 0, timeout: 10_000 },
  })
})

test('Stripe product image uploads use the explicit ten-second timeout for both raw requests', () => {
  const source = readFileSync(scriptPath, 'utf8')
  assert.equal((source.match(/signal: AbortSignal\.timeout\(STRIPE_CATALOG_REQUEST_TIMEOUT_MS\)/g) ?? []).length, 2)
  assert.match(source, /files\.stripe\.com\/v1\/files[\s\S]*signal: AbortSignal\.timeout\(STRIPE_CATALOG_REQUEST_TIMEOUT_MS\)/)
  assert.match(source, /api\.stripe\.com\/v1\/file_links[\s\S]*signal: AbortSignal\.timeout\(STRIPE_CATALOG_REQUEST_TIMEOUT_MS\)/)
  assert.match(source, /'Idempotency-Key': `\$\{idempotencyKey\}-file`/)
  assert.match(source, /'Idempotency-Key': `\$\{idempotencyKey\}-link`/)
})

test('catalog planning fails closed when the required local Growth image is missing', async () => {
  await assert.rejects(
    () => createCatalogPlan({
      readAdapter: fakeReadAdapter(fakeCatalog()),
      imageFiles: {
        growth: {
          path: 'scripts/assets/stripe/growth.png',
          exists: false,
        },
      },
      accountMode: 'test',
    }),
    /Stripe catalog image is missing/,
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
      default_price: null,
      images: [],
    },
  ]
  const prices = {
    'prod-growth': [],
  }
  return { products, prices }
}

function retiredCatalog() {
  const catalog = fakeCatalog()
  catalog.products = [
    catalog.products[1],
    {
      id: 'prod-managed-a',
      active: true,
      name: 'Managed',
      description: 'Retired managed plan',
      metadata: { plan_id: 'managed' },
      default_price: 'price-managed-a',
      images: ['https://files.example/managed-a.png'],
    },
    {
      id: 'prod-managed-b',
      active: true,
      name: 'Managed (duplicate)',
      description: 'Retired managed duplicate',
      metadata: { plan_id: 'managed' },
      default_price: 'price-managed-b',
      images: ['https://files.example/managed-b.png'],
    },
    {
      id: 'prod-seo',
      active: true,
      name: 'SEO Accelerator',
      description: 'Retired SEO plan',
      metadata: { plan_id: 'seo_accelerator' },
      default_price: 'price-seo',
      images: ['https://files.example/seo.png'],
    },
  ]
  catalog.prices = {
    'prod-growth': [],
    'prod-managed-a': [{
      id: 'price-managed-a',
      product: 'prod-managed-a',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 14900,
      recurring: { interval: 'month', interval_count: 1 },
    }],
    'prod-managed-b': [{
      id: 'price-managed-b',
      product: 'prod-managed-b',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 14900,
      recurring: { interval: 'month', interval_count: 1 },
    }],
    'prod-seo': [{
      id: 'price-seo',
      product: 'prod-seo',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 34900,
      recurring: { interval: 'month', interval_count: 1 },
    }],
  }
  return catalog
}

function retirementOnlyCatalog() {
  const catalog = retiredCatalog()
  catalog.prices['prod-growth'] = [{
    id: 'price-growth',
    product: 'prod-growth',
    active: true,
    type: 'recurring',
    currency: 'usd',
    unit_amount: 4900,
    lookup_key: 'growth-monthly',
    metadata: {},
    recurring: { interval: 'month', interval_count: 1 },
  }]
  return catalog
}

function duplicateGrowthCatalog() {
  const catalog = fakeCatalog()
  catalog.products.splice(1, 1,
    {
      id: 'prod-growth-a',
      active: true,
      name: 'Growth (legacy)',
      description: 'Old description',
      metadata: { plan_id: 'growth', seat_price_id: 'price-growth-a-seat' },
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
      {
        id: 'price-growth-a-seat',
        product: 'prod-growth-a',
        active: true,
        type: 'recurring',
        currency: 'usd',
        unit_amount: 9900,
        recurring: { interval: 'month', interval_count: 1 },
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

function canonicalPriceContractCatalog({ annual = true, ambiguousAnnual = false } = {}) {
  const catalog = fakeCatalog()
  catalog.products.splice(1, 1, {
    id: 'prod-growth',
    active: true,
    name: 'Growth',
    description: 'Current description',
    metadata: {
      plan_id: 'growth',
      monthly_price_id: 'price-growth-base',
      ...(annual && !ambiguousAnnual ? { annual_price_id: 'price-growth-annual' } : {}),
      seat_price_id: 'price-growth-seat',
      currency: 'eur',
    },
    default_price: 'price-growth-base',
    images: [],
  })
  const growthPrices = [
    {
      id: 'price-growth-seat',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 9900,
      lookup_key: 'growth-seat-monthly',
      metadata: { role: 'seat' },
      recurring: { interval: 'month', interval_count: 1 },
    },
    {
      id: 'price-growth-base',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 4900,
      lookup_key: 'growth-monthly',
      metadata: { role: 'base' },
      recurring: { interval: 'month', interval_count: 1 },
    },
    {
      id: 'price-growth-old',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 3900,
      lookup_key: 'growth-old-monthly',
      metadata: { role: 'old-base' },
      recurring: { interval: 'month', interval_count: 1 },
    },
    {
      id: 'price-growth-addon-weekly',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 1000,
      lookup_key: 'growth-addon-weekly',
      metadata: { role: 'addon' },
      recurring: { interval: 'week', interval_count: 1 },
    },
  ]
  if (annual) {
    growthPrices.push({
      id: 'price-growth-annual',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: 58800,
      lookup_key: 'growth-annual',
      metadata: { role: 'base' },
      recurring: { interval: 'year', interval_count: 1 },
    })
    if (ambiguousAnnual) {
      growthPrices.push({
        id: 'price-growth-annual-alt',
        product: 'prod-growth',
        active: true,
        type: 'recurring',
        currency: 'usd',
        unit_amount: 58800,
        lookup_key: 'growth-annual-alt',
        metadata: { role: 'old-base' },
        recurring: { interval: 'year', interval_count: 1 },
      })
    }
  }
  catalog.prices = { 'prod-growth': growthPrices }
  return catalog
}

function fakeReadAdapter(catalog, writes = []) {
  return {
    account: {
      retrieve: async () => ({ id: catalog.accountId ?? 'acct_krabiclawtest' }),
    },
    products: {
      list: async ({ active } = {}) => ({
        data: catalog.products.filter(product => typeof active !== 'boolean' || (product.active !== false) === active),
        has_more: false,
      }),
      create: async params => { writes.push(['products.create', params]); return { id: 'unexpected-product' } },
      update: async (id, params) => { writes.push(['products.update', id, params]); return { id } },
    },
    prices: {
      list: async ({ product, active, type }) => ({
        data: (catalog.prices[product] ?? []).filter(price =>
          (typeof active !== 'boolean' || (price.active !== false) === active)
          && (!type || price.type === type),
        ),
        has_more: false,
      }),
      create: async params => { writes.push(['prices.create', params]); return { id: 'unexpected-price' } },
      update: async (id, params) => { writes.push(['prices.update', id, params]); return { id } },
    },
  }
}

function noWriteAdapter(writes, catalog) {
  let productSequence = 0
  let priceSequence = 0
  return {
    products: {
      create: async params => {
        writes.push(['products.create', params])
        const id = `created-product-${++productSequence}`
        if (catalog) catalog.products.push({ id, active: true, ...params, metadata: { ...(params.metadata ?? {}) }, default_price: params.default_price ?? null, images: params.images ?? [] })
        return { id }
      },
      update: async (id, params) => {
        writes.push(['products.update', id, params])
        if (catalog) {
          const product = catalog.products.find(candidate => candidate.id === id)
          if (product) {
            Object.assign(product, params, {
              active: params.active ?? product.active,
              default_price: params.default_price === '' ? null : (params.default_price ?? product.default_price),
            })
          }
        }
        return { id }
      },
    },
    prices: {
      create: async params => {
        writes.push(['prices.create', params])
        const id = `created-price-${++priceSequence}`
        if (catalog) {
          const row = { id, active: true, type: 'recurring', lookup_key: null, metadata: {}, ...params, product: params.product }
          catalog.prices[params.product] = [...(catalog.prices[params.product] ?? []), row]
        }
        return { id }
      },
      update: async (id, params) => {
        writes.push(['prices.update', id, params])
        if (catalog) {
          for (const prices of Object.values(catalog.prices)) {
            const price = prices.find(candidate => candidate.id === id)
            if (price) Object.assign(price, params)
          }
        }
        return { id }
      },
    },
  }
}

function stripeLikeRetirementMutationAdapter(writes, catalog) {
  const adapter = noWriteAdapter(writes, catalog)
  const productUpdate = adapter.products.update
  const priceUpdate = adapter.prices.update
  adapter.prices.update = async (id, params, requestOptions) => {
    const product = catalog.products.find(candidate =>
      candidate.active !== false
      && candidate.default_price === id,
    )
    if (params?.active === false && product) {
      throw new Error(`Stripe rejected deactivation of ${id}: it is the default price for ${product.id}`)
    }
    return priceUpdate(id, params, requestOptions)
  }
  adapter.products.update = async (id, params, requestOptions) => productUpdate(id, params, requestOptions)
  return adapter
}

function postApplyEquivalentCatalog(imageHash = 'a'.repeat(64)) {
  const definition = PLAN_DEFINITIONS.find(candidate => candidate.planId === 'growth')
  assert.ok(definition)
  const catalog = fakeCatalog()
  catalog.products[1] = {
    id: 'prod-growth',
    active: true,
    name: definition.name,
    description: definition.description,
    marketing_features: definition.features.map(name => ({ name })),
    metadata: {
      plan_id: definition.planId,
      highlighted: 'true',
      badge: definition.badge,
      monthly_price_id: 'price-growth',
      currency: 'usd',
      catalog_image_sha256: imageHash,
    },
    default_price: 'price-growth',
    images: ['https://files.example/growth.png'],
  }
  catalog.prices = {
    'prod-growth': [{
      id: 'price-growth',
      product: 'prod-growth',
      active: true,
      type: 'recurring',
      currency: 'usd',
      unit_amount: definition.amountCents,
      recurring: { interval: 'month', interval_count: 1 },
    }],
  }
  return catalog
}

function retiredAddonCatalog({ activeProduct = false, unknownProduct = false } = {}) {
  const catalog = postApplyEquivalentCatalog()
  const productId = activeProduct ? 'prod-seasonal-active' : 'prod-seasonal-archived'
  catalog.products.push({
    id: productId,
    active: activeProduct,
    name: activeProduct ? 'Seasonal Add-on' : 'Archived Seasonal Add-on',
    description: 'Retired add-on',
    metadata: { addon_type: 'seasonal' },
    default_price: 'price-seasonal-addon',
    images: [],
  })
  catalog.prices[productId] = [{
    id: 'price-seasonal-addon',
    product: productId,
    active: true,
    type: 'one_time',
    currency: 'usd',
    unit_amount: 9900,
    lookup_key: 'seasonal-addon',
    metadata: { addon_type: 'seasonal' },
    recurring: null,
  }]
  if (unknownProduct) {
    catalog.products.push({
      id: 'prod-unknown-name-match',
      active: true,
      name: 'Managed',
      description: 'Unknown catalog product with a retired name',
      metadata: {},
      default_price: 'price-unknown-name-match',
      images: [],
    })
    catalog.prices['prod-unknown-name-match'] = [{
      id: 'price-unknown-name-match',
      product: 'prod-unknown-name-match',
      active: true,
      type: 'one_time',
      currency: 'usd',
      unit_amount: 1234,
      lookup_key: 'unknown-name-match',
      metadata: {},
      recurring: null,
    }]
  }
  return catalog
}

function localGrowthImage(sha256) {
  return {
    growth: {
      path: 'scripts/assets/stripe/growth.png',
      exists: true,
      sha256,
      mimeType: 'image/png',
      fileName: 'growth.png',
    },
  }
}

test('post-apply-equivalent catalog snapshot produces zero operations', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(postApplyEquivalentCatalog()),
    imageFiles: localGrowthImage('a'.repeat(64)),
    accountMode: 'test',
  })

  assert.deepEqual(plan.operations, [])
})

test('retirement-only plans sign scope and never mutate the canonical Growth product', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(retirementOnlyCatalog()),
    imageFiles: {
      growth: { path: 'scripts/assets/stripe/growth.png', exists: false },
    },
    accountMode: 'test',
    retirementOnly: true,
  })

  assert.equal(plan.scope, 'retirement-only')
  assert.equal(plan.planSha256, planSha256(plan))
  assert.equal(plan.operations.some(operation =>
    operation.productId === 'prod-growth'
    || operation.priceId === 'price-growth'
    || operation.planId === 'growth'
    || operation.product?.id === 'prod-growth',
  ), false)
  assert.deepEqual(
    plan.operations
      .filter(operation => operation.type === 'archive_product')
      .map(operation => operation.productId),
    ['prod-managed-a', 'prod-managed-b', 'prod-seo'],
  )
})

test('retirement-only planning fails closed on missing, ambiguous, or drifted Growth safety', async () => {
  const wrongAmount = retirementOnlyCatalog()
  wrongAmount.prices['prod-growth'][0].unit_amount = 5000
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(wrongAmount), imageFiles: {}, accountMode: 'test', retirementOnly: true }),
    /must be usd 4900 cents/,
  )

  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(duplicateGrowthCatalog()), imageFiles: {}, accountMode: 'test', retirementOnly: true }),
    /exactly one active canonical Growth product/,
  )

  const missingGrowth = retirementOnlyCatalog()
  missingGrowth.products.find(product => product.id === 'prod-growth').active = false
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(missingGrowth), imageFiles: {}, accountMode: 'test', retirementOnly: true }),
    /exactly one active canonical Growth product/,
  )

  const mixedAnnualCurrency = retirementOnlyCatalog()
  mixedAnnualCurrency.products.find(product => product.id === 'prod-growth').metadata.annual_price_id = 'price-growth-annual'
  mixedAnnualCurrency.prices['prod-growth'].push({
    id: 'price-growth-annual',
    product: 'prod-growth',
    active: true,
    type: 'recurring',
    currency: 'eur',
    unit_amount: 58800,
    lookup_key: 'growth-annual',
    metadata: {},
    recurring: { interval: 'year', interval_count: 1 },
  })
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(mixedAnnualCurrency), imageFiles: {}, accountMode: 'test', retirementOnly: true }),
    /monthly and annual prices in different currencies/,
  )
})

test('retirement-only apply preserves the signed scope and writes no Growth operations', async () => {
  const catalog = retirementOnlyCatalog()
  const plan = await createCatalogPlan({ readAdapter: fakeReadAdapter(catalog), imageFiles: {}, accountMode: 'test', retirementOnly: true })
  const writes = []
  const result = await applyCatalogPlan({
    plan,
    confirmedSha256: plan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: noWriteAdapter(writes, catalog),
    filesAdapter: {},
    journalPath: journalPath('retirement-only'),
  })

  assert.equal(result.status, 'complete')
  assert.equal(writes.some(([, id, params]) =>
    id === 'prod-growth' || id === 'price-growth' || params?.metadata?.plan_id === 'growth',
  ), false)
})

test('catalog snapshots enumerate active and inactive one-time prices for every product', async () => {
  const catalog = retiredAddonCatalog()
  const readAdapter = fakeReadAdapter(catalog)
  const priceQueries = []
  const originalPriceList = readAdapter.prices.list
  readAdapter.prices.list = async args => {
    priceQueries.push(args)
    return originalPriceList(args)
  }

  const plan = await createCatalogPlan({ readAdapter, imageFiles: {}, accountMode: 'test' })
  const snapshotPrice = plan.providerSnapshot.pricesByProduct['prod-seasonal-archived']?.[0]
  assert.equal(snapshotPrice?.type, 'one_time')
  assert.equal(snapshotPrice?.active, true)
  assert.deepEqual(
    plan.operations
      .filter(operation => operation.productId === 'prod-seasonal-archived')
      .map(operation => [operation.type, operation.priceId ?? operation.productId]),
    [['deactivate_price', 'price-seasonal-addon']],
  )
  assert.equal(priceQueries.some(query => query.product === 'prod-seasonal-archived' && query.active === true), true)
  assert.equal(priceQueries.some(query => query.product === 'prod-seasonal-archived' && query.active === false), true)
  assert.equal(priceQueries.every(query => !Object.hasOwn(query, 'type')), true)
})

test('catalog retirement uses exact metadata families and archives only after active prices are deactivated', async () => {
  const catalog = retiredAddonCatalog({ activeProduct: true, unknownProduct: true })
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const seasonalOperations = plan.operations.filter(operation =>
    operation.productId === 'prod-seasonal-active' || operation.priceId === 'price-seasonal-addon',
  )
  assert.deepEqual(seasonalOperations.map(operation => operation.type), ['clear_product_default_price', 'deactivate_price', 'archive_product'])
  assert.equal(
    plan.operations.some(operation =>
      operation.productId === 'prod-unknown-name-match' || operation.priceId === 'price-unknown-name-match',
    ),
    false,
  )
  assert.equal(
    plan.providerSnapshot.pricesByProduct['prod-unknown-name-match']?.some(price => price.id === 'price-unknown-name-match'),
    true,
  )
})

test('retirement clears an active retired default price before deactivation and archives, then reruns zero-op', async () => {
  const catalog = retiredAddonCatalog({ activeProduct: true })
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const seasonalOperations = plan.operations.filter(operation =>
    operation.productId === 'prod-seasonal-active' || operation.priceId === 'price-seasonal-addon',
  )
  assert.deepEqual(seasonalOperations.map(operation => operation.type), [
    'clear_product_default_price',
    'deactivate_price',
    'archive_product',
  ])
  const clear = seasonalOperations[0]
  assert.equal(clear?.defaultPriceId, 'price-seasonal-addon')
  assert.equal(clear?.expectedDefaultPriceId, 'price-seasonal-addon')
  assert.equal(clear?.expected?.default_price, 'price-seasonal-addon')
  assert.equal(clear?.expectedDefaultPrice?.id, 'price-seasonal-addon')

  const writes = []
  const result = await applyCatalogPlan({
    plan,
    confirmedSha256: plan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: stripeLikeRetirementMutationAdapter(writes, catalog),
    filesAdapter: {},
    journalPath: journalPath('retirement-default-price'),
  })
  assert.equal(result.status, 'complete')
  assert.deepEqual(
    writes
      .filter(([type, id]) => (type === 'products.update' && id === 'prod-seasonal-active') || (type === 'prices.update' && id === 'price-seasonal-addon'))
      .map(([type, id, params]) => [type, id, params]),
    [
      ['products.update', 'prod-seasonal-active', { default_price: '' }],
      ['prices.update', 'price-seasonal-addon', { active: false }],
      ['products.update', 'prod-seasonal-active', { active: false }],
    ],
  )
  assert.equal(catalog.products.find(product => product.id === 'prod-seasonal-active')?.default_price, null)

  const rerun = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  assert.deepEqual(rerun.operations, [])
})

test('catalog retirement rerun is zero-op after known prices are inactive', async () => {
  const catalog = retiredAddonCatalog()
  const price = catalog.prices['prod-seasonal-archived']?.[0]
  assert.ok(price)
  price.active = false
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  assert.deepEqual(plan.operations, [])
})

test('changed local image produces exactly one upload and one product update', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(postApplyEquivalentCatalog()),
    imageFiles: localGrowthImage('b'.repeat(64)),
    accountMode: 'test',
  })

  assert.deepEqual(plan.operations.map(operation => operation.type), [
    'upload_product_image',
    'update_product',
  ])
  const update = plan.operations.find(operation => operation.type === 'update_product')
  assert.deepEqual(update?.params?.images, [{ ref: { kind: 'file', planId: 'growth' } }])
  assert.equal(update?.params?.metadata?.catalog_image_sha256, 'b'.repeat(64))
})

test('canonical product updates clear stale optional annual metadata', async () => {
  const catalog = postApplyEquivalentCatalog()
  catalog.products[1].metadata.annual_price_id = 'price-stale-annual'
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: localGrowthImage('a'.repeat(64)),
    accountMode: 'test',
  })

  assert.deepEqual(plan.operations.map(operation => operation.type), ['update_product'])
  const update = plan.operations[0]
  assert.equal(update?.params?.metadata?.annual_price_id, '')
})

test('catalog plan retires every active Managed/SEO product and recurring price without new-sale operations', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(retiredCatalog()),
    imageFiles: {},
    accountMode: 'test',
  })

  assert.deepEqual(
    plan.operations
      .filter(operation => operation.type === 'deactivate_price')
      .map(operation => [operation.productId, operation.priceId]),
    [
      ['prod-managed-a', 'price-managed-a'],
      ['prod-managed-b', 'price-managed-b'],
      ['prod-seo', 'price-seo'],
    ],
  )
  assert.deepEqual(
    plan.operations
      .filter(operation => operation.type === 'archive_product')
      .map(operation => operation.productId),
    ['prod-managed-a', 'prod-managed-b', 'prod-seo'],
  )
  assert.equal(
    plan.operations.some(operation =>
      ['create_product', 'create_price', 'update_product', 'upload_product_image'].includes(operation.type)
      && ['managed', 'seo_accelerator'].includes(operation.planId ?? operation.product?.metadata?.plan_id),
    ),
    false,
  )
  assert.deepEqual(
    Object.keys(plan.providerSnapshot.pricesByProduct).sort(),
    ['prod-growth', 'prod-managed-a', 'prod-managed-b', 'prod-seo'],
  )
})

test('catalog plan deactivates active prices on archived known-plan products', async () => {
  const catalog = retiredCatalog()
  const archivedManaged = catalog.products.find(product => product.id === 'prod-managed-a')
  assert.ok(archivedManaged)
  archivedManaged.active = false
  catalog.products.push({
    id: 'prod-growth-archived',
    active: false,
    name: 'Archived Growth',
    description: 'Historical Growth product',
    metadata: { plan_id: 'growth' },
    default_price: 'price-growth-archived',
    images: [],
  })
  catalog.prices['prod-growth-archived'] = [{
    id: 'price-growth-archived',
    product: 'prod-growth-archived',
    active: true,
    type: 'recurring',
    currency: 'usd',
    unit_amount: 4900,
    lookup_key: null,
    metadata: {},
    recurring: { interval: 'month', interval_count: 1 },
  }]

  const readAdapter = fakeReadAdapter(catalog)
  const productActivityQueries = []
  const originalProductList = readAdapter.products.list
  readAdapter.products.list = async args => {
    productActivityQueries.push(args?.active)
    return originalProductList(args)
  }
  const plan = await createCatalogPlan({
    readAdapter,
    imageFiles: {},
    accountMode: 'test',
  })

  assert.deepEqual(productActivityQueries, [true, false])
  assert.equal(plan.providerSnapshot.products.some(product => product.id === 'prod-managed-a' && product.active === false), true)
  assert.deepEqual(
    plan.operations
      .filter(operation => operation.type === 'deactivate_price')
      .map(operation => operation.priceId)
      .filter(id => id === 'price-managed-a' || id === 'price-growth-archived')
      .sort(),
    ['price-growth-archived', 'price-managed-a'],
  )
  assert.equal(
    plan.operations.some(operation => operation.type === 'archive_product' && operation.productId === 'prod-managed-a'),
    false,
  )
})

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
    ['growth'],
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
    ['price-growth-a', 'price-growth-a-seat', 'price-growth-a-year'],
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
    mutationAdapter: noWriteAdapter(writes, catalog),
    filesAdapter: {},
    journalPath: journalPath('duplicate-selection'),
  })
  assert.deepEqual(
    writes.filter(([type, id]) => type === 'prices.update' && ['price-growth-a', 'price-growth-a-seat', 'price-growth-a-year'].includes(id)),
    [
      ['prices.update', 'price-growth-a', { active: false }],
      ['prices.update', 'price-growth-a-seat', { active: false }],
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

test('catalog reconciliation preserves seat prices and resolves base monthly and annual prices', async () => {
  const catalog = canonicalPriceContractCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const growthUpdate = plan.operations.find(operation => operation.type === 'update_product' && operation.product?.id === 'prod-growth')
  assert.equal(growthUpdate?.params?.default_price, 'price-growth-base')
  assert.equal(growthUpdate?.params?.metadata?.monthly_price_id, 'price-growth-base')
  assert.equal(growthUpdate?.params?.metadata?.annual_price_id, 'price-growth-annual')
  assert.equal(growthUpdate?.params?.metadata?.seat_price_id, 'price-growth-seat')
  assert.equal(growthUpdate?.params?.metadata?.currency, 'usd')
  assert.deepEqual(
    plan.operations
      .filter(operation => operation.type === 'deactivate_price' && operation.productId === 'prod-growth')
      .map(operation => operation.priceId),
    ['price-growth-old'],
  )
  assert.equal(plan.operations.some(operation => operation.type === 'deactivate_price' && operation.priceId === 'price-growth-seat'), false)

  const baseSnapshotPrice = plan.providerSnapshot.pricesByProduct['prod-growth'].find(price => price.id === 'price-growth-base')
  assert.equal(baseSnapshotPrice?.lookup_key, 'growth-monthly')
  assert.deepEqual(baseSnapshotPrice?.metadata, { role: 'base' })
  const changed = canonicalPriceContractCatalog()
  changed.prices['prod-growth'][1].metadata.role = 'changed'
  const changedPlan = await createCatalogPlan({ readAdapter: fakeReadAdapter(changed), imageFiles: {}, accountMode: 'test' })
  assert.notEqual(changedPlan.planSha256, plan.planSha256)
})

test('catalog reconciliation keeps annual absent and rejects ambiguous annual candidates', async () => {
  const withoutAnnual = await createCatalogPlan({
    readAdapter: fakeReadAdapter(canonicalPriceContractCatalog({ annual: false })),
    imageFiles: {},
    accountMode: 'test',
  })
  const withoutAnnualUpdate = withoutAnnual.operations.find(operation => operation.type === 'update_product' && operation.product?.id === 'prod-growth')
  assert.equal(Object.hasOwn(withoutAnnualUpdate?.params?.metadata ?? {}, 'annual_price_id'), false)
  assert.equal(withoutAnnual.operations.some(operation => operation.type === 'create_price' && operation.planId === 'growth' && operation.params?.recurring?.interval === 'year'), false)

  await assert.rejects(
    () => createCatalogPlan({
      readAdapter: fakeReadAdapter(canonicalPriceContractCatalog({ ambiguousAnnual: true })),
      imageFiles: {},
      accountMode: 'test',
    }),
    /multiple annual prices marked by lookup_key/,
  )

  const mixedCurrency = canonicalPriceContractCatalog()
  const mixedAnnual = mixedCurrency.prices['prod-growth'].find(price => price.id === 'price-growth-annual')
  assert.ok(mixedAnnual)
  mixedAnnual.currency = 'eur'
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(mixedCurrency), imageFiles: {}, accountMode: 'test' }),
    /monthly and annual prices in different currencies/,
  )
})

test('catalog reconciliation rejects canonical Growth prices with wrong fixed amounts', async () => {
  const catalog = canonicalPriceContractCatalog()
  catalog.products[1].metadata.monthly_price_id = 'price-growth-old'
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(catalog), imageFiles: {}, accountMode: 'test' }),
    /canonical monthly price price-growth-old must be usd 4900 cents/,
  )

  const wrongAnnual = canonicalPriceContractCatalog()
  const annualPrice = wrongAnnual.prices['prod-growth'].find(price => price.id === 'price-growth-annual')
  assert.ok(annualPrice)
  annualPrice.unit_amount = 60000
  await assert.rejects(
    () => createCatalogPlan({ readAdapter: fakeReadAdapter(wrongAnnual), imageFiles: {}, accountMode: 'test' }),
    /Growth annual price must be exactly USD 58800 cents/,
  )
})

test('planned canonical product state loads through the Better Auth Stripe runtime contract', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(canonicalPriceContractCatalog()),
    imageFiles: {},
    accountMode: 'test',
  })
  const sourceProduct = plan.providerSnapshot.products.find(product => product.id === 'prod-growth')
  const sourcePrices = plan.providerSnapshot.pricesByProduct['prod-growth']
  assert.ok(sourceProduct)
  assert.ok(sourcePrices)

  const growthUpdate = plan.operations.find(operation => operation.type === 'update_product' && operation.product?.id === 'prod-growth')
  assert.ok(growthUpdate)
  const deactivatedPriceIds = new Set(
    plan.operations
      .filter(operation => operation.type === 'deactivate_price' && operation.productId === 'prod-growth')
      .map(operation => operation.priceId),
  )
  const materializedProduct = {
    ...sourceProduct,
    ...growthUpdate.params,
    metadata: { ...sourceProduct.metadata, ...growthUpdate.params.metadata },
  }
  const materializedPrices = sourcePrices.filter(price => !deactivatedPriceIds.has(price.id))
  const stripe = {
    products: {
      list: async () => ({ data: [materializedProduct], has_more: false }),
    },
    prices: {
      list: async () => ({ data: materializedPrices, has_more: false }),
    },
  }

  const plans = await getBetterAuthStripePlans(stripe as never, {})
  assert.equal(plans.length, 1)
  assert.deepEqual(
    {
      priceId: plans[0]?.priceId,
      lookupKey: plans[0]?.lookupKey,
      annualDiscountPriceId: plans[0]?.annualDiscountPriceId,
      annualDiscountLookupKey: plans[0]?.annualDiscountLookupKey,
      seatPriceId: plans[0]?.seatPriceId,
    },
    {
      priceId: 'price-growth-base',
      lookupKey: 'growth-monthly',
      annualDiscountPriceId: 'price-growth-annual',
      annualDiscountLookupKey: 'growth-annual',
      seatPriceId: 'price-growth-seat',
    },
  )
  assert.equal(materializedPrices.some(price => price.id === 'price-growth-seat'), true)
})

test('apply rejects old or foreign catalog plans before provider or file access', async () => {
  const catalog = fakeCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {
      growth: {
        path: 'scripts/assets/stripe/growth.png',
        exists: true,
        sha256: 'a'.repeat(64),
        mimeType: 'image/png',
        fileName: 'growth.png',
      },
    },
    accountMode: 'test',
  })
  const reads = []
  const readAdapter = fakeReadAdapter(catalog)
  const guardedReadAdapter = {
    account: {
      retrieve: async () => {
        reads.push('account.retrieve')
        return readAdapter.account.retrieve()
      },
    },
    products: {
      list: async (...args) => {
        reads.push('products.list')
        return readAdapter.products.list(...args)
      },
    },
    prices: {
      list: async (...args) => {
        reads.push('prices.list')
        return readAdapter.prices.list(...args)
      },
    },
  }
  const writes = []
  const fileCalls = []
  const filesAdapter = {
    verifyProductImage: async operation => { fileCalls.push(operation.path) },
  }

  for (const [label, patch, message] of [
    ['old schema', { schemaVersion: 3 }, /schema version/],
    ['foreign kind', { kind: 'foreign-catalog-plan' }, /kind/],
  ]) {
    const invalid = { ...plan, ...patch }
    invalid.planSha256 = planSha256(invalid)
    await assert.rejects(
      () => applyCatalogPlan({
        plan: invalid,
        confirmedSha256: invalid.planSha256,
        key: 'rk_test_fake',
        readAdapter: guardedReadAdapter,
    mutationAdapter: noWriteAdapter(writes, catalog),
        filesAdapter,
        journalPath: journalPath(label),
      }),
      message,
      label,
    )
  }

  assert.deepEqual(reads, [])
  assert.deepEqual(fileCalls, [])
  assert.deepEqual(writes, [])
})

test('apply rejects hash mismatch, snapshot drift, and live keys before any writes', async () => {
  const catalog = fakeCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const writes = []
  const mutations = noWriteAdapter(writes, catalog)
  const files = { verifyProductImage: async () => { throw new Error('should not verify') } }

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: '0'.repeat(64),
      key: 'sk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: mutations,
      filesAdapter: files,
      journalPath: journalPath('hash-mismatch'),
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
      journalPath: journalPath('unsupported-operation'),
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
      journalPath: journalPath('snapshot-drift'),
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
      journalPath: journalPath('live-key'),
    }),
    /test-mode key/,
  )
  assert.equal(writes.length, 0)
})

test('apply rejects a different Stripe account before any catalog mutation', async () => {
  const catalog = fakeCatalog()
  catalog.accountId = 'acct_reviewed'
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const otherAccountCatalog = structuredClone(catalog)
  otherAccountCatalog.accountId = 'acct_other'
  const writes = []

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'rk_test_fake',
      readAdapter: fakeReadAdapter(otherAccountCatalog),
      mutationAdapter: noWriteAdapter(writes, otherAccountCatalog),
      filesAdapter: {},
      journalPath: journalPath('other-account'),
    }),
    /belongs to account acct_reviewed, not acct_other/,
  )
  assert.equal(writes.length, 0)
})

test('catalog apply keeps every operation and final proof bound to the reviewed Stripe account', async () => {
  const operationCatalog = retiredCatalog()
  operationCatalog.accountId = 'acct_reviewed'
  const operationPlan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(operationCatalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const operationReads = fakeReadAdapter(operationCatalog)
  let operationAccountReads = 0
  operationReads.account.retrieve = async () => ({
    id: ++operationAccountReads >= 2 ? 'acct_other' : operationCatalog.accountId,
  })
  const operationWrites = []

  await assert.rejects(
    () => applyCatalogPlan({
      plan: operationPlan,
      confirmedSha256: operationPlan.planSha256,
      key: 'rk_test_fake',
      readAdapter: operationReads,
      mutationAdapter: noWriteAdapter(operationWrites, operationCatalog),
      filesAdapter: {},
      journalPath: journalPath('account-switch-operation'),
    }),
    error => error?.status === 'incomplete' && /status=incomplete/.test(error.message),
  )
  assert.equal(operationWrites.length, 0)

  const finalCatalog = retiredCatalog()
  finalCatalog.accountId = 'acct_reviewed'
  const finalPlan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(finalCatalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const finalReads = fakeReadAdapter(finalCatalog)
  let finalAccountReads = 0
  finalReads.account.retrieve = async () => ({
    id: ++finalAccountReads > finalPlan.operations.length + 1 ? 'acct_other' : finalCatalog.accountId,
  })
  const finalJournalPath = journalPath('account-switch-final')

  await assert.rejects(
    () => applyCatalogPlan({
      plan: finalPlan,
      confirmedSha256: finalPlan.planSha256,
      key: 'rk_test_fake',
      readAdapter: finalReads,
      mutationAdapter: noWriteAdapter([], finalCatalog),
      filesAdapter: {},
      journalPath: finalJournalPath,
    }),
    error => error?.status === 'incomplete' && /zero remaining operations/.test(error.message),
  )
  assert.equal(JSON.parse(readFileSync(finalJournalPath, 'utf8')).status, 'incomplete')
})

test('valid test-mode apply performs only the reviewed operations', async () => {
  const catalog = retiredCatalog()
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
        const id = `created-${params.metadata.plan_id}`
        catalog.products.push({ id, active: true, ...params, metadata: { ...(params.metadata ?? {}) }, default_price: params.default_price ?? null, images: params.images ?? [] })
        return { id }
      },
      update: async (id, params) => {
        writes.push(['products.update', id, params])
        const product = catalog.products.find(candidate => candidate.id === id)
        if (product) {
          Object.assign(product, params, {
            default_price: params.default_price === '' ? null : (params.default_price ?? product.default_price),
          })
        }
        return { id }
      },
    },
    prices: {
      create: async params => {
        writes.push(['prices.create', params])
        const id = `created-price-${params.product}`
        catalog.prices[params.product] = [...(catalog.prices[params.product] ?? []), { id, active: true, type: 'recurring', lookup_key: null, metadata: {}, ...params, product: params.product }]
        return { id }
      },
      update: async (id, params) => {
        writes.push(['prices.update', id, params])
        for (const prices of Object.values(catalog.prices)) {
          const price = prices.find(candidate => candidate.id === id)
          if (price) Object.assign(price, params)
        }
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
    journalPath: journalPath('valid-apply'),
  })

  assert.equal(result.appliedOperations, plan.operations.length)
  assert.equal(writes.length, plan.operations.length)
  assert.deepEqual(writes.map(([type]) => type), plan.operations.map(operation => ({
      archive_product: 'products.update',
      clear_product_default_price: 'products.update',
      create_product: 'products.create',
    create_price: 'prices.create',
    deactivate_price: 'prices.update',
    update_product: 'products.update',
  }[operation.type])))
  assert.deepEqual(
    writes
      .filter(([type, id, params]) => type === 'products.update' && params?.active === false && ['prod-managed-a', 'prod-managed-b', 'prod-seo'].includes(id))
      .map(([, id]) => id),
    ['prod-managed-a', 'prod-managed-b', 'prod-seo'],
  )
  assert.equal(
    writes.some(([type, params]) => type === 'products.create' && ['managed', 'seo_accelerator'].includes(params?.metadata?.plan_id)),
    false,
  )
  const prices = writes
    .filter(([type]) => type === 'prices.create')
    .map(([, params]) => [params.product, params.unit_amount])
  assert.deepEqual(prices, [
    ['prod-growth', 4900],
  ])
})

test('every catalog provider mutation is bound to a stable signed-operation idempotency key', async () => {
  const catalog = retiredCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const mutations = noWriteAdapter([], catalog)
  const captured = []

  for (const [resource, methods] of [
    ['products', ['create', 'update']],
    ['prices', ['create', 'update']],
  ]) {
    for (const method of methods) {
      const original = mutations[resource][method]
      mutations[resource][method] = async (...args) => {
        captured.push(args.at(-1)?.idempotencyKey)
        return original(...args.slice(0, -1))
      }
    }
  }

  await applyCatalogPlan({
    plan,
    confirmedSha256: plan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: mutations,
    filesAdapter: {},
    journalPath: journalPath('idempotency'),
  })

  assert.deepEqual(
    captured,
    plan.operations.map((operation, index) =>
      `krabiclaw-catalog-${plan.planSha256}-${index}-${operation.type}`,
    ),
  )
  assert.equal(new Set(captured).size, captured.length)
})

test('catalog operations sign canonical work before duplicate and retired cleanup', async () => {
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(retiredCatalog()),
    imageFiles: {},
    accountMode: 'test',
  })
  const firstDestructive = plan.operations.findIndex(operation => ['deactivate_price', 'archive_product'].includes(operation.type))
  assert.ok(firstDestructive > 0)
  assert.equal(plan.operations.slice(0, firstDestructive).every(operation => !['deactivate_price', 'archive_product'].includes(operation.type)), true)
})

test('catalog apply re-proves canonical readiness before every destructive mutation', async () => {
  const catalog = retiredCatalog()
  const plan = await createCatalogPlan({
    readAdapter: fakeReadAdapter(catalog),
    imageFiles: {},
    accountMode: 'test',
  })
  const writes = []
  const mutations = noWriteAdapter(writes, catalog)
  const originalPriceUpdate = mutations.prices.update
  let corrupted = false
  mutations.prices.update = async (...args) => {
    const result = await originalPriceUpdate(...args)
    if (!corrupted && args[1]?.active === false) {
      corrupted = true
      const growth = catalog.products.find(product => product.id === 'prod-growth')
      assert.ok(growth)
      growth.description = 'Provider drift after the first destructive mutation'
    }
    return result
  }

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'rk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: mutations,
      filesAdapter: {},
      journalPath: journalPath('canonical-recheck'),
    }),
    error => error?.status === 'incomplete' && /status=incomplete/.test(error.message),
  )

  const destructiveWrites = writes.filter(([type, _id, params]) =>
    (type === 'prices.update' || type === 'products.update') && params?.active === false,
  )
  assert.equal(destructiveWrites.length, 1)
})

test('failed provider mutation leaves a durable incomplete journal and resumes without repeating applied work', async () => {
  const catalog = retiredCatalog()
  const plan = await createCatalogPlan({ readAdapter: fakeReadAdapter(catalog), imageFiles: {}, accountMode: 'test' })
  const journal = journalPath('resume')
  const firstWrites = []
  let failAfterMutation = true
  const firstMutation = noWriteAdapter(firstWrites, catalog)
  const originalUpdate = firstMutation.products.update
  firstMutation.products.update = async (id, params) => {
    const result = await originalUpdate(id, params)
    if (failAfterMutation && id === 'prod-growth') {
      failAfterMutation = false
      throw new Error('simulated provider response loss after mutation')
    }
    return result
  }

  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'rk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: firstMutation,
      filesAdapter: {},
      journalPath: journal,
    }),
    error => error?.status === 'incomplete' && /status=incomplete/.test(error.message),
  )
  const incomplete = JSON.parse(readFileSync(journal, 'utf8'))
  assert.equal(incomplete.status, 'incomplete')
  assert.equal(incomplete.operations[0].status, 'applied')
  assert.equal(incomplete.operations[1].status, 'failed')
  assert.match(incomplete.operations[1].error.message, /simulated provider response loss/)

  const resumeWrites = []
  const resumed = await applyCatalogPlan({
    plan,
    confirmedSha256: plan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(catalog),
    mutationAdapter: noWriteAdapter(resumeWrites, catalog),
    filesAdapter: {},
    journalPath: journal,
  })
  assert.equal(resumed.status, 'complete')
  assert.equal(resumeWrites.some(([type]) => type === 'prices.create'), false)
  assert.equal(JSON.parse(readFileSync(journal, 'utf8')).status, 'complete')
})

test('catalog apply refuses to reuse a journal for a different signed plan', async () => {
  const firstCatalog = retiredCatalog()
  const firstPlan = await createCatalogPlan({ readAdapter: fakeReadAdapter(firstCatalog), imageFiles: {}, accountMode: 'test' })
  const journal = journalPath('mismatch')
  const firstResult = await applyCatalogPlan({
    plan: firstPlan,
    confirmedSha256: firstPlan.planSha256,
    key: 'rk_test_fake',
    readAdapter: fakeReadAdapter(firstCatalog),
    mutationAdapter: noWriteAdapter([], firstCatalog),
    filesAdapter: {},
    journalPath: journal,
  })
  assert.equal(firstResult.status, 'complete')

  const secondCatalog = fakeCatalog()
  const secondPlan = await createCatalogPlan({ readAdapter: fakeReadAdapter(secondCatalog), imageFiles: {}, accountMode: 'test' })
  await assert.rejects(
    () => applyCatalogPlan({
      plan: secondPlan,
      confirmedSha256: secondPlan.planSha256,
      key: 'rk_test_fake',
      readAdapter: fakeReadAdapter(secondCatalog),
      mutationAdapter: noWriteAdapter([], secondCatalog),
      filesAdapter: {},
      journalPath: journal,
    }),
    /belongs to a different plan SHA-256/,
  )
})

test('catalog apply refuses success when the final provider snapshot still has drift', async () => {
  const catalog = retiredCatalog()
  const plan = await createCatalogPlan({ readAdapter: fakeReadAdapter(catalog), imageFiles: {}, accountMode: 'test' })
  const journal = journalPath('final-drift')
  const writes = []
  const mutation = noWriteAdapter(writes, catalog)
  const normalProductUpdate = mutation.products.update
  mutation.products.update = async (id, params) => {
    if (id === 'prod-seo' && params.active === false) {
      writes.push(['products.update', id, params])
      return { id }
    }
    return normalProductUpdate(id, params)
  }
  await assert.rejects(
    () => applyCatalogPlan({
      plan,
      confirmedSha256: plan.planSha256,
      key: 'rk_test_fake',
      readAdapter: fakeReadAdapter(catalog),
      mutationAdapter: mutation,
      filesAdapter: {},
      journalPath: journal,
    }),
    error => error?.status === 'incomplete' && /zero remaining operations/.test(error.message),
  )
  const finalJournal = JSON.parse(readFileSync(journal, 'utf8'))
  assert.equal(finalJournal.status, 'incomplete')
  assert.notEqual(finalJournal.status, 'complete')
})
