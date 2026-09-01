import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>
type BatchQuery = { query: string, params?: unknown[] }
const sqliteParams = (params: unknown[]) => params.map(value => typeof value === 'boolean' ? Number(value) : value)

mock.module('../../server/db/index.ts', {
  namedExports: {
    createDb: () => { throw new Error('createDb is not used by this integration fixture') },
    schema: {},
    d1JsonArray: (values: unknown[]) => JSON.stringify(values),
    execute: async (sqlite: SqliteDb, query: string, params: unknown[] = []) => {
      const result = sqlite.prepare(query).run(...sqliteParams(params))
      return { meta: { changes: Number(result.changes) } }
    },
    executeBatch: async (sqlite: SqliteDb, batch: BatchQuery[]) => {
      const transaction = sqlite.transaction((statements: BatchQuery[]) => statements.map((statement) => {
        try {
          const result = sqlite.prepare(statement.query).run(...sqliteParams(statement.params ?? []))
          return { success: true, meta: { changes: Number(result.changes) } }
        } catch (error) {
          throw new Error(`${error instanceof Error ? error.message : String(error)}\nSQL: ${statement.query}`)
        }
      }))
      return transaction(batch)
    },
    queryAll: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> => sqlite.prepare(query).all(...sqliteParams(params)) as T[],
    queryFirst: async <T>(sqlite: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> => (sqlite.prepare(query).get(...sqliteParams(params)) as T | undefined) ?? null,
  },
})

const { createProduct, getProduct, moveProductCategory, moveProducts, updateProduct } = await import('../../server/utils/product-management.ts?product-price-integration')
const { createExperience, getExperienceById, updateExperience } = await import('../../server/utils/experiences.ts?experience-price-integration')

function fixtureDatabase() {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(readFileSync('migrations/0000_epoch_3_baseline.sql', 'utf8'))
  database.prepare("INSERT INTO themes (id, name, slug) VALUES ('saya-theme-v1', 'Saya', 'saya')").run()
  database.prepare("INSERT INTO organization (id, name, slug) VALUES ('org', 'Org', 'org')").run()
  database.prepare("INSERT INTO user (id, name, email) VALUES ('user', 'Editor', 'editor@example.com')").run()
  database.prepare("INSERT INTO sites (id, organization_id, slug, subdomain, default_currency) VALUES ('site', 'org', 'site', 'site', 'THB')").run()
  database.prepare("INSERT INTO business_locations (id, organization_id, site_id, slug, title) VALUES ('location', 'org', 'site', 'location', 'Location')").run()
  return database
}

function insertOrderedProducts(database: SqliteDb, products: ReadonlyArray<readonly [id: string, category: string]>) {
  database.exec('DROP INDEX products_site_location_type_sort_order_unique')
  const insert = database.prepare(`
    INSERT INTO products (
      id, organization_id, site_id, location_id, category, name, slug,
      sort_order, created_by, updated_by
    ) VALUES (?, 'org', 'site', 'location', ?, ?, ?, ?, 'user', 'user')
  `)
  for (const [sortOrder, [id, category]] of products.entries()) {
    insert.run(id, category, id.toUpperCase(), id, sortOrder)
  }
}

test('Product service persists one canonical Price and returns the joined contract', async () => {
  const database = fixtureDatabase()
  try {
    const product = await createProduct(database as unknown as D1Database, 'org', 'site', 'location', {
      category: 'Food',
      name: 'Green Curry',
      price: {
        amount_minor: 12500,
        unit: 'person',
        tax_behavior: 'inclusive',
        compare_at_amount_minor: 15000,
        valid_from: '2026-01-01T00:00:00.000Z',
        provenance: 'integration-test',
      },
    }, 'user')

    assert.equal(product.price?.amount_minor, 12500)
    assert.equal(product.price?.currency, 'THB')
    assert.equal(product.price?.unit, 'person')
    assert.equal(product.price?.tax_behavior, 'inclusive')
    assert.equal(product.price?.provenance, 'integration-test')
    assert.equal(database.prepare('SELECT count(*) count FROM prices WHERE product_id=?').get(product.id).count, 1)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('Product repricing closes the current immutable Price and schedules its replacement atomically', async () => {
  const database = fixtureDatabase()
  try {
    const product = await createProduct(database as unknown as D1Database, 'org', 'site', 'location', {
      category: 'Food', name: 'Massaman Curry',
      price: { amount_minor: 10000, valid_from: '2026-01-01T00:00:00.000Z' },
    }, 'user')
    const currentPriceId = product.price!.id
    const replacementAt = '2026-09-15T00:00:00.000Z'

    const updated = await updateProduct(database as unknown as D1Database, 'org', 'site', 'location', product.id, {
      price: { amount_minor: 12000, valid_from: replacementAt, valid_until: '2026-12-01T00:00:00.000Z' },
    }, 'user')

    const persisted = database.prepare('SELECT id, amount_minor, valid_from, valid_until FROM prices WHERE product_id=? ORDER BY valid_from').all(product.id) as Array<Record<string, unknown>>
    assert.equal(persisted.length, 2)
    assert.deepEqual(persisted[0], {
      id: currentPriceId, amount_minor: 10000, valid_from: '2026-01-01T00:00:00.000Z', valid_until: replacementAt,
    })
    assert.deepEqual(persisted[1], {
      id: updated.scheduled_prices?.[0]?.id, amount_minor: 12000, valid_from: replacementAt, valid_until: '2026-12-01T00:00:00.000Z',
    })
    assert.equal((await getProduct(database as unknown as D1Database, 'org', 'site', 'location', product.id))?.scheduled_prices?.length, 1)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('Product replacement rejects an overlapping scheduled Price without mutating either row', async () => {
  const database = fixtureDatabase()
  try {
    const product = await createProduct(database as unknown as D1Database, 'org', 'site', 'location', {
      category: 'Food', name: 'Tom Yum',
      price: { amount_minor: 9000, valid_from: '2026-01-01T00:00:00.000Z' },
    }, 'user')
    await updateProduct(database as unknown as D1Database, 'org', 'site', 'location', product.id, {
      price: { amount_minor: 9500, valid_from: '2026-09-15T00:00:00.000Z', valid_until: '2026-12-01T00:00:00.000Z' },
    }, 'user')
    const before = database.prepare('SELECT id, amount_minor, valid_from, valid_until FROM prices WHERE product_id=? ORDER BY valid_from').all(product.id)

    await assert.rejects(
      updateProduct(database as unknown as D1Database, 'org', 'site', 'location', product.id, {
        price: { amount_minor: 11000, valid_from: '2026-10-01T00:00:00.000Z', valid_until: '2026-11-01T00:00:00.000Z' },
      }, 'user'),
      /overlaps an existing Price/,
    )
    assert.deepEqual(database.prepare('SELECT id, amount_minor, valid_from, valid_until FROM prices WHERE product_id=? ORDER BY valid_from').all(product.id), before)
  } finally {
    database.close()
  }
})

test('concurrent Product moves both apply to the live location order', async () => {
  const database = fixtureDatabase()
  try {
    insertOrderedProducts(database, [['a', 'Food'], ['b', 'Food'], ['c', 'Food'], ['d', 'Food']])

    await Promise.all([
      moveProducts({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        productIds: ['a'],
        beforeProductId: 'c',
        actor: 'user',
      }),
      moveProducts({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        productIds: ['d'],
        beforeProductId: 'b',
        actor: 'user',
      }),
    ])

    const order = database.prepare("SELECT id FROM products WHERE product_type = 'standard' ORDER BY sort_order, id").all()
    assert.deepEqual(order, [{ id: 'd' }, { id: 'b' }, { id: 'a' }, { id: 'c' }])
  } finally {
    database.close()
  }
})

test('concurrent Product category moves both apply to the live location order', async () => {
  const database = fixtureDatabase()
  try {
    insertOrderedProducts(database, [
      ['a1', 'A'],
      ['a2', 'A'],
      ['b', 'B'],
      ['c', 'C'],
      ['d', 'D'],
    ])

    await Promise.all([
      moveProductCategory({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        category: 'A',
        beforeCategory: 'C',
        actor: 'user',
      }),
      moveProductCategory({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        category: 'D',
        beforeCategory: 'B',
        actor: 'user',
      }),
    ])

    const order = database.prepare("SELECT id FROM products WHERE product_type = 'standard' ORDER BY sort_order, id").all()
    assert.deepEqual(order, [{ id: 'd' }, { id: 'b' }, { id: 'a1' }, { id: 'a2' }, { id: 'c' }])
  } finally {
    database.close()
  }
})

test('a category move preserves a concurrent move within that category', async () => {
  const database = fixtureDatabase()
  try {
    insertOrderedProducts(database, [
      ['a1', 'A'],
      ['a2', 'A'],
      ['b1', 'B'],
      ['b2', 'B'],
      ['c', 'C'],
    ])

    await Promise.all([
      moveProducts({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        productIds: ['a2'],
        beforeProductId: 'a1',
        actor: 'user',
      }),
      moveProductCategory({
        db: database as unknown as D1Database,
        organizationId: 'org',
        siteId: 'site',
        locationId: 'location',
        category: 'A',
        beforeCategory: 'C',
        actor: 'user',
      }),
    ])

    const order = database.prepare("SELECT id FROM products WHERE product_type = 'standard' ORDER BY sort_order, id").all()
    assert.deepEqual(order, [{ id: 'b1' }, { id: 'b2' }, { id: 'a2' }, { id: 'a1' }, { id: 'c' }])
  } finally {
    database.close()
  }
})

test('Experience uses its stable ID for the one-to-one Product extension and joined Price', async () => {
  const database = fixtureDatabase()
  try {
    const experience = await createExperience(database as unknown as D1Database, 'org', 'site', {
      location_id: 'location',
      title: 'Sunset Table',
      body: 'Dinner overlooking the bay.',
      duration_minutes: 120,
      price: {
        amount_minor: 250000,
        unit: 'table',
        valid_from: '2026-01-01T00:00:00.000Z',
      },
    }, 'user')

    const product = database.prepare('SELECT id, product_type, name, description FROM products WHERE id=?').get(experience.id)
    assert.deepEqual(product, {
      id: experience.id,
      product_type: 'experience',
      name: 'Sunset Table',
      description: 'Dinner overlooking the bay.',
    })
    assert.equal(database.prepare('SELECT id FROM experiences WHERE id=?').get(experience.id).id, experience.id)
    assert.equal(experience.price?.product_id, experience.id)
    assert.equal(experience.price?.unit, 'table')
    assert.equal(experience.pricing_note, null)
    assert.equal(database.pragma('foreign_key_check').length, 0)
  } finally {
    database.close()
  }
})

test('inquiry-only Experience has no active Price and keeps only its concise pricing note', async () => {
  const database = fixtureDatabase()
  try {
    const experience = await createExperience(database as unknown as D1Database, 'org', 'site', {
      location_id: 'location',
      title: 'Private Workshop',
      pricing_note: 'Contact us for a tailored quote.',
    }, 'user')

    assert.equal(experience.price, null)
    assert.equal(experience.pricing_note, 'Contact us for a tailored quote.')
    assert.equal(database.prepare('SELECT count(*) count FROM prices WHERE product_id=?').get(experience.id).count, 0)

    const repriced = await updateExperience(database as unknown as D1Database, 'site', experience.id, {
      price: { amount_minor: 50000, unit: 'person', valid_from: '2026-09-15T00:00:00.000Z' },
    })
    assert.equal(repriced?.pricing_note, null)
    assert.equal(repriced?.scheduled_prices?.length, 1)
    assert.equal((await getExperienceById(database as unknown as D1Database, 'site', experience.id))?.id, experience.id)
  } finally {
    database.close()
  }
})
