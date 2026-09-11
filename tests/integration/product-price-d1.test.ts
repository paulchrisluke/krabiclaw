import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import {
  createCollection,
  createMetafieldDefinition,
  createProduct,
  deleteProduct,
  getProduct,
  listCollectionProducts,
  listLocationProducts,
  listSiteProducts,
  reconcileProducts,
  resolveVariantPrice,
  setCollectionProducts,
  setProductLocation,
  setProductPublication,
  updateProduct,
} from '../../server/utils/product-management.ts'
import { AmbiguousPriceError } from '../../shared/prices.ts'

const ORG = 'org'
const ACTOR = { actorId: 'actor' }
const NOW = '2026-09-11T00:00:00.000Z'

async function boot() {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'catalog-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const db = await runtime.getD1Database('DB')
  const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
  await db.batch(statements.map(statement => db.prepare(statement)))
  await db.prepare("INSERT INTO organization (id, name, slug) VALUES (?, 'Org', 'org')").bind(ORG).run()
  await db.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'Actor', 'actor@example.test', 0, 0, 0)").bind(ACTOR.actorId).run()
  for (const [site, currency] of [['site-a', 'THB'], ['site-b', 'USD']]) {
    await db.prepare(`INSERT INTO sites (id, organization_id, slug, settings_json, integrations_json, theme_id, default_currency, status, onboarding_status, url_structure, vertical, created_at, updated_at)
      VALUES (?, ?, ?, '{"config":{"default_timezone":"Asia/Bangkok"}}', '{}', 'theme', ?, 'active', 'complete', 'flat', 'restaurant', ?, ?)`)
      .bind(site, ORG, site, currency, NOW, NOW).run()
  }
  for (const [loc, site] of [['loc-a', 'site-a'], ['loc-b', 'site-b']]) {
    await db.prepare(`INSERT INTO business_locations (id, organization_id, site_id, slug, title, status, timezone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 'Asia/Bangkok', ?, ?)`).bind(loc, ORG, site, loc, loc, NOW, NOW).run()
  }
  return { runtime, db }
}

test('one product identity serves two sites and two locations', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const product = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Tom Yum Soup',
      variants: [{ name: 'Default', prices: [
        { unit_amount: 25000, currency: 'THB' },
        { unit_amount: 27000, currency: 'THB', location_id: 'loc-a' },
        { unit_amount: 900, currency: 'USD' },
      ] }],
    } })
    assert.equal(product.variants.length, 1, 'a product with no options still has one real variant')
    assert.equal(product.variants[0]!.prices.length, 3)

    await setProductPublication(db, { organizationId: ORG, productId: product.id, siteId: 'site-a', published: true, actor: ACTOR })
    await setProductPublication(db, { organizationId: ORG, productId: product.id, siteId: 'site-b', published: true, actor: ACTOR })
    await setProductLocation(db, { organizationId: ORG, productId: product.id, locationId: 'loc-a', published: true, actor: ACTOR })
    await setProductLocation(db, { organizationId: ORG, productId: product.id, locationId: 'loc-b', published: true, actor: ACTOR })

    assert.equal(await db.prepare('SELECT count(*) n FROM products').first<number>('n'), 1, 'publishing twice did not duplicate identity')
    assert.equal((await listSiteProducts(db, { organizationId: ORG, siteId: 'site-a', publishedOnly: true })).length, 1)
    assert.equal((await listSiteProducts(db, { organizationId: ORG, siteId: 'site-b', publishedOnly: true })).length, 1)
    assert.equal((await listLocationProducts(db, { organizationId: ORG, locationId: 'loc-a', publishedOnly: true })).length, 1)

    // Scope-specific prices stay independent, resolved through one contract.
    const variant = (await getProduct(db, ORG, product.id)).variants[0]!
    assert.equal(resolveVariantPrice(variant, { currency: 'THB', location_id: 'loc-a', at: NOW })!.unit_amount, 27000)
    assert.equal(resolveVariantPrice(variant, { currency: 'THB', location_id: 'loc-b', at: NOW })!.unit_amount, 25000)
    assert.equal(resolveVariantPrice(variant, { currency: 'USD', location_id: null, at: NOW })!.unit_amount, 900)
    assert.equal(resolveVariantPrice(variant, { currency: 'EUR', location_id: null, at: NOW }), null, 'an unpriced currency is not substituted')

    // The audit trail records the write, rather than failing quietly.
    assert.equal(await db.prepare("SELECT count(*) n FROM activity_entries WHERE event_name = 'product.created'").first<number>('n'), 1)
  } finally { await runtime.dispose() }
})

test('merchant activation, site publication, and location publication are distinct states', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const product = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: { name: 'Pad Thai' } })
    await setProductPublication(db, { organizationId: ORG, productId: product.id, siteId: 'site-a', published: true, actor: ACTOR })
    await setProductLocation(db, { organizationId: ORG, productId: product.id, locationId: 'loc-a', published: true, active: true, actor: ACTOR })

    await updateProduct(db, { organizationId: ORG, siteId: 'site-a', productId: product.id, patch: { active: false }, actor: ACTOR })
    const disabled = await getProduct(db, ORG, product.id)
    assert.equal(disabled.active, false, 'the merchant sale switch is off')
    assert.equal(disabled.publications[0]!.published, true, 'disabling did not unpublish it')
    assert.equal(disabled.locations[0]!.published, true, 'disabling did not withdraw it from the location')
    // Nothing in the model says "sold out": that is a stock or capacity result
    // and a disabled product has made no claim about either.
    assert.equal(Object.hasOwn(disabled, 'available'), false)

    await setProductPublication(db, { organizationId: ORG, productId: product.id, siteId: 'site-a', published: false, actor: ACTOR })
    const withheld = await getProduct(db, ORG, product.id)
    assert.equal(withheld.locations[0]!.published, true, 'site publication is independent of location publication')
    assert.equal((await listSiteProducts(db, { organizationId: ORG, siteId: 'site-a', publishedOnly: true })).length, 0)
    assert.equal((await listSiteProducts(db, { organizationId: ORG, siteId: 'site-a' })).length, 1, 'the site still carries it, withheld')
  } finally { await runtime.dispose() }
})

test('a simple product and an optioned product use the same variant-price path', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const simple = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Espresso', variants: [{ name: 'Default', prices: [{ unit_amount: 8000, currency: 'THB' }] }],
    } })
    const optioned = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Latte',
      options: [{ id: 'opt-size', name: 'Size', values: [{ id: 'val-s', value: 'Small' }, { id: 'val-l', value: 'Large' }] }],
      variants: [
        { id: 'var-s', name: 'Small', option_values: { 'opt-size': 'val-s' }, prices: [{ unit_amount: 9000, currency: 'THB' }] },
        { id: 'var-l', name: 'Large', option_values: { 'opt-size': 'val-l' }, prices: [{ unit_amount: 12000, currency: 'THB' }] },
      ],
    } })
    for (const product of [simple, optioned]) {
      for (const variant of product.variants) {
        assert(resolveVariantPrice(variant, { currency: 'THB', location_id: null, at: NOW }), `${product.name}/${variant.name} prices through the same path`)
      }
    }
    assert.equal(optioned.variants.length, 2)
    assert.deepEqual(optioned.variants.map(v => v.option_values), [{ 'opt-size': 'val-s' }, { 'opt-size': 'val-l' }])

    // Invalid option combinations are refused.
    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Broken A',
      options: [{ id: 'o1', name: 'Size', values: [{ id: 'v1', value: 'S' }] }],
      variants: [{ name: 'No selection', option_values: {} }],
    } }), /must select a value for every option/)
    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Broken B',
      options: [{ id: 'o1', name: 'Size', values: [{ id: 'v1', value: 'S' }] }],
      variants: [
        { name: 'One', option_values: { o1: 'v1' } },
        { name: 'Two', option_values: { o1: 'v1' } },
      ],
    } }), /same combination/)
    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Broken C',
      options: [{ id: 'o1', name: 'Size', values: [{ id: 'v1', value: 'S' }] }],
      variants: [{ name: 'Alien', option_values: { o2: 'v9' } }],
    } }), /options this product does not define/)
  } finally { await runtime.dispose() }
})

test('ambiguous pricing is refused at write time, not resolved at read time', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Two Prices',
      variants: [{ name: 'Default', prices: [
        { unit_amount: 10000, currency: 'THB' },
        { unit_amount: 12000, currency: 'THB' },
      ] }],
    } }), AmbiguousPriceError)

    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Bad Recurrence',
      variants: [{ name: 'Default', prices: [{ unit_amount: 10000, currency: 'THB', type: 'recurring' }] }],
    } }), /recurring price requires/)

    // Consecutive windows are not a conflict.
    const scheduled = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Seasonal',
      variants: [{ name: 'Default', prices: [
        { unit_amount: 10000, currency: 'THB', valid_until_at: '2026-10-01T00:00:00.000Z' },
        { unit_amount: 12000, currency: 'THB', valid_from_at: '2026-10-01T00:00:00.000Z' },
      ] }],
    } })
    const variant = scheduled.variants[0]!
    assert.equal(resolveVariantPrice(variant, { currency: 'THB', location_id: null, at: '2026-09-15T00:00:00.000Z' })!.unit_amount, 10000)
    assert.equal(resolveVariantPrice(variant, { currency: 'THB', location_id: null, at: '2026-11-15T00:00:00.000Z' })!.unit_amount, 12000)
  } finally { await runtime.dispose() }
})

test('collections carry grouping and order without copying the product', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const a = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: { name: 'Soup' } })
    const b = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: { name: 'Salad' } })
    const starters = await createCollection(db, { organizationId: ORG, actor: ACTOR, collection: { site_id: 'site-a', name: 'Starters' } })
    const featured = await createCollection(db, { organizationId: ORG, actor: ACTOR, collection: { site_id: 'site-a', name: 'Featured' } })
    const branch = await createCollection(db, { organizationId: ORG, actor: ACTOR, collection: { site_id: 'site-a', location_id: 'loc-a', name: 'Branch Menu' } })

    await setCollectionProducts(db, { organizationId: ORG, collectionId: starters.id, productIds: [b.id, a.id], actor: ACTOR })
    await setCollectionProducts(db, { organizationId: ORG, collectionId: featured.id, productIds: [a.id], actor: ACTOR })
    await setCollectionProducts(db, { organizationId: ORG, collectionId: branch.id, productIds: [a.id, b.id], actor: ACTOR })

    assert.deepEqual((await listCollectionProducts(db, { organizationId: ORG, collectionId: starters.id })).map(p => p.name), ['Salad', 'Soup'])
    assert.deepEqual((await listCollectionProducts(db, { organizationId: ORG, collectionId: branch.id })).map(p => p.name), ['Soup', 'Salad'])
    assert.equal(await db.prepare('SELECT count(*) n FROM products').first<number>('n'), 2, 'appearing in three collections copied nothing')

    // "Featured" is curated membership, not a second truth on the product.
    const soup = await getProduct(db, ORG, a.id)
    assert.equal(soup.collections.length, 3)
    assert.equal(Object.hasOwn(soup, 'featured'), false)
  } finally { await runtime.dispose() }
})

test('metafields carry descriptive attributes, and an undefined one is refused', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const allergens = await createMetafieldDefinition(db, { organizationId: ORG, actor: ACTOR, definition: {
      namespace: 'menu', key: 'allergens', name: 'Allergens', description: null,
      value_type: 'list.single_line_text', validations: {}, localizable: true,
    } })
    const bring = await createMetafieldDefinition(db, { organizationId: ORG, actor: ACTOR, definition: {
      namespace: 'menu', key: 'what-to-bring', name: 'What to bring', description: null,
      value_type: 'list.single_line_text', validations: {}, localizable: true,
    } })
    assert.notEqual(allergens.id, bring.id)

    const product = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Pad Thai', metafields: { 'menu.allergens': ['Peanuts'], 'menu.what-to-bring': ['Appetite'] },
    } })
    assert.deepEqual(product.metafields['menu.allergens'], ['Peanuts'])
    assert.deepEqual(product.metafields['menu.what-to-bring'], ['Appetite'], 'inclusions and preparation stay distinct')

    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Undefined attribute', metafields: { 'menu.unknown': ['x'] },
    } }), /has no definition/)
    await assert.rejects(createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Wrong type', metafields: { 'menu.allergens': 'Peanuts' },
    } }), /must be a list/)
  } finally { await runtime.dispose() }
})

test('reconcile converges instead of duplicating, and deletion respects the canonical page', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const rows = [{ product_id: 'src-1', name: 'Imported One' }, { product_id: 'src-2', name: 'Imported Two' }]
    await reconcileProducts(db, { organizationId: ORG, siteId: 'site-a', products: rows, actor: ACTOR })
    await reconcileProducts(db, { organizationId: ORG, siteId: 'site-a', products: rows, actor: ACTOR })
    assert.equal(await db.prepare('SELECT count(*) n FROM products').first<number>('n'), 2, 'running the same import twice converges')

    await reconcileProducts(db, { organizationId: ORG, siteId: 'site-a', products: [rows[0]!], actor: ACTOR, deactivateMissing: true })
    assert.equal(await db.prepare("SELECT active FROM products WHERE id = 'src-2'").first<number>('active'), 0,
      'a product missing from the import is deactivated, not deleted')
    assert.equal(await db.prepare('SELECT count(*) n FROM products').first<number>('n'), 2)

    // A canonical page blocks deletion loudly rather than vanishing.
    await db.prepare(`INSERT INTO site_locales (id, organization_id, site_id, locale, is_source, status, created_at, updated_at)
      VALUES ('sl-en', ?, 'site-a', 'en', 1, 'published', ?, ?)`).bind(ORG, NOW, NOW).run()
    await db.prepare(`INSERT INTO content_documents (id, organization_id, site_id, kind, row_role, locale, product_id, title, path, sort_order, metadata_json, created_at, updated_at)
      VALUES ('doc-1', ?, 'site-a', 'page', 'root', 'en', 'src-1', 'One', '/one', 0, '{"page_type":"custom"}', ?, ?)`).bind(ORG, NOW, NOW).run()
    await assert.rejects(deleteProduct(db, { organizationId: ORG, productId: 'src-1' }), /Unbind or delete the product page/)

    await db.prepare("DELETE FROM content_documents WHERE id = 'doc-1'").run()
    await deleteProduct(db, { organizationId: ORG, productId: 'src-1' })
    assert.equal(await db.prepare('SELECT count(*) n FROM products').first<number>('n'), 1)
    assert.equal(await db.prepare('SELECT count(*) n FROM product_variants').first<number>('n'), 1, 'the deleted product took its variants with it')
  } finally { await runtime.dispose() }
})

test('editing a product keeps variant identity, so bookings survive', { timeout: 120_000 }, async () => {
  const { runtime, db } = await boot()
  try {
    const product = await createProduct(db, { organizationId: ORG, siteId: 'site-a', actor: ACTOR, product: {
      name: 'Class', variants: [{ id: 'var-adult', name: 'Adult', prices: [{ unit_amount: 50000, currency: 'THB' }] }],
    } })
    await db.prepare(`INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_by, updated_by)
      VALUES (?, ?, 60, 5, 'a', 'a')`).bind(product.id, ORG).run()
    await db.prepare(`INSERT INTO product_sessions (id, organization_id, product_id, timezone, starts_at, ends_at, capacity, status, created_by, updated_by)
      VALUES ('s1', ?, ?, 'Asia/Bangkok', '2099-01-01T00:00:00.000Z', '2099-01-01T01:00:00.000Z', 5, 'scheduled', 'a', 'a')`).bind(ORG, product.id).run()
    await db.prepare(`INSERT INTO bookings (id, organization_id, site_id, product_id, product_session_id, product_variant_id, party_size, status)
      VALUES ('b1', ?, 'site-a', ?, 's1', 'var-adult', 2, 'confirmed')`).bind(ORG, product.id).run()

    await updateProduct(db, { organizationId: ORG, siteId: 'site-a', productId: product.id, patch: { description: 'Now with clay' }, actor: ACTOR })
    assert.equal(await db.prepare("SELECT count(*) n FROM bookings WHERE id = 'b1'").first<number>('n'), 1,
      'editing the product did not drop the booking')
    assert.equal((await getProduct(db, ORG, product.id)).description, 'Now with clay')
    assert.equal(await db.prepare("SELECT count(*) n FROM product_sessions WHERE id = 's1'").first<number>('n'), 1)
  } finally { await runtime.dispose() }
})
