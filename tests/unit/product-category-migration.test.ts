import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error - the migration script is plain JS tooling, not typed source.
import { planCategories } from '../../scripts/product-category-data.mjs'

interface LegacyProduct {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  product_type: string
  category: string
  sort_order: number
}

function product(overrides: Partial<LegacyProduct> & Pick<LegacyProduct, 'id' | 'category' | 'sort_order'>): LegacyProduct {
  return {
    organization_id: 'org',
    site_id: 'site',
    location_id: 'loc-1',
    product_type: 'standard',
    ...overrides,
  }
}

test('category order follows first appearance in the existing flat order', () => {
  // This is the whole safety property of the migration: customers must see the
  // same sections in the same order after it runs as before.
  const { categories } = planCategories([
    product({ id: 'p1', category: 'Starters', sort_order: 0 }),
    product({ id: 'p2', category: 'Starters', sort_order: 1 }),
    product({ id: 'p3', category: 'Mains', sort_order: 2 }),
    product({ id: 'p4', category: 'Desserts', sort_order: 3 }),
  ])

  assert.deepEqual(categories.map((category: { name: string }) => category.name), ['Starters', 'Mains', 'Desserts'])
  assert.deepEqual(categories.map((category: { sort_order: number }) => category.sort_order), [0, 1, 2])
})

test('product order restarts densely inside each category', () => {
  const { assignments } = planCategories([
    product({ id: 'p1', category: 'Starters', sort_order: 0 }),
    product({ id: 'p2', category: 'Mains', sort_order: 1 }),
    product({ id: 'p3', category: 'Mains', sort_order: 2 }),
    product({ id: 'p4', category: 'Mains', sort_order: 3 }),
  ])

  const byProduct = new Map(assignments.map((row: { product_id: string; sort_order: number }) => [row.product_id, row.sort_order]))
  assert.equal(byProduct.get('p1'), 0)
  assert.equal(byProduct.get('p2'), 0)
  assert.equal(byProduct.get('p3'), 1)
  assert.equal(byProduct.get('p4'), 2)
})

test('a category that appears again later does not split into two categories', () => {
  // The old flat model allowed a category's Products to be non-contiguous.
  // Those rows have to collapse into one category, not two with the same name,
  // which the unique (location, type, name) constraint would reject anyway.
  const { categories, assignments } = planCategories([
    product({ id: 'p1', category: 'Mains', sort_order: 0 }),
    product({ id: 'p2', category: 'Starters', sort_order: 1 }),
    product({ id: 'p3', category: 'Mains', sort_order: 2 }),
  ])

  assert.equal(categories.length, 2)
  const mains = assignments.filter((row: { category_id: string }) => row.category_id === categories[0].id)
  assert.deepEqual(mains.map((row: { product_id: string }) => row.product_id), ['p1', 'p3'])
  assert.deepEqual(mains.map((row: { sort_order: number }) => row.sort_order), [0, 1])
})

test('locations and product types get separate categories', () => {
  // Experiences carry a hardcoded 'Experiences' category. It must not merge
  // with a standard menu section of the same name at the same location.
  const { categories } = planCategories([
    product({ id: 'p1', category: 'Mains', sort_order: 0, location_id: 'loc-1' }),
    product({ id: 'p2', category: 'Mains', sort_order: 0, location_id: 'loc-2' }),
    product({ id: 'p3', category: 'Mains', sort_order: 0, product_type: 'experience' }),
  ])

  assert.equal(categories.length, 3)
  assert.equal(new Set(categories.map((category: { id: string }) => category.id)).size, 3)
})

test('categories with the same slug at one location keep distinct slugs', () => {
  const { categories } = planCategories([
    product({ id: 'p1', category: 'Small Plates', sort_order: 0 }),
    product({ id: 'p2', category: 'small-plates', sort_order: 1 }),
  ])

  const slugs = categories.map((category: { slug: string }) => category.slug)
  assert.equal(new Set(slugs).size, 2, `expected distinct slugs, got ${slugs.join(', ')}`)
})

test('a blank category fails loudly instead of dropping the Product', () => {
  assert.throws(
    () => planCategories([
      product({ id: 'p1', category: 'Mains', sort_order: 0 }),
      product({ id: 'p2', category: '   ', sort_order: 1 }),
    ]),
    /p2/,
  )
})

test('every Product is assigned exactly once', () => {
  const products = Array.from({ length: 25 }, (_, index) => product({
    id: `p${index}`,
    category: `Section ${index % 4}`,
    sort_order: index,
  }))

  const { assignments } = planCategories(products)
  assert.equal(assignments.length, products.length)
  assert.equal(new Set(assignments.map((row: { product_id: string }) => row.product_id)).size, products.length)
})
