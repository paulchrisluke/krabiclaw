import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Product } from '../../server/types/products.ts'
import {
  catalogLabel,
  catalogSummary,
  catalogSurfaces,
  collectionsOnSurface,
  countCatalog,
  isCatalogSurface,
} from '../../utils/product-presentation.ts'

// The invariant: a Product is on the Experiences surface because it takes
// bookings, and on the vertical's own surface otherwise. Nothing else assigns
// a surface — there is no discriminator to read — so a restaurant that sells
// dishes and bookable experiences manages two surfaces, and one that sells
// only dishes still manages a Menu of Sections.

const dish = { booking: null } as Pick<Product, 'booking'>
const experience = { booking: { id: 'booking-1' } } as unknown as Pick<Product, 'booking'>

test('a restaurant selling only food reaches the menu surface alone', () => {
  const counts = countCatalog([dish, dish])
  assert.deepEqual(catalogSurfaces('restaurant', counts), ['menu'])
  assert.equal(catalogLabel('restaurant', counts), 'Menu')
  assert.equal(catalogSummary('restaurant', counts), '2 dishes')
})

test('a restaurant that also takes bookings reaches both surfaces, menu first', () => {
  const counts = countCatalog([dish, dish, experience])
  assert.deepEqual(catalogSurfaces('restaurant', counts), ['menu', 'experiences'])
  // Neither word names the other, so the level that holds both is the catalog.
  assert.equal(catalogLabel('restaurant', counts), 'Catalog')
  assert.equal(catalogSummary('restaurant', counts), '2 dishes · 1 experience')
})

test('an empty catalog invites the vertical\'s own first item', () => {
  assert.deepEqual(catalogSurfaces('restaurant', countCatalog([])), ['menu'])
  assert.equal(catalogSummary('restaurant', countCatalog([])), 'Add your first dish')
  assert.equal(catalogSummary('experience', countCatalog([])), 'Add your first product')
})

test('a bookable catalog reads as experiences whatever the vertical sells otherwise', () => {
  const counts = countCatalog([experience])
  assert.deepEqual(catalogSurfaces('experience', counts), ['experiences'])
  assert.equal(catalogLabel('experience', counts), 'Experiences')
  assert.equal(catalogSummary('experience', counts), '1 experience')
})

test('the same two numbers come from rows or from a count the server did', () => {
  // summarizeLocationProducts answers in this shape straight from SQL, so a
  // surface is assigned identically however the caller learned the counts.
  assert.deepEqual(countCatalog([dish, dish, experience]), { total: 3, experiences: 1 })
  assert.equal(catalogSummary('restaurant', { total: 3, experiences: 1 }), '2 dishes · 1 experience')
})

test('only a vertical\'s own surface and experiences are pages', () => {
  assert.equal(isCatalogSurface('restaurant', 'menu'), true)
  assert.equal(isCatalogSurface('restaurant', 'experiences'), true)
  assert.equal(isCatalogSurface('restaurant', 'products'), false)
  assert.equal(isCatalogSurface('experience', 'products'), true)
  assert.equal(isCatalogSurface('restaurant', 'pc_loc-demo_standard_drinks'), false)
})

test('a mixed restaurant manages each surface\'s collections separately', () => {
  const rows = [
    { name: 'Wood-Fired Pizza', products: [dish, dish] },
    { name: 'Experiences', products: [experience] },
    { name: 'Drinks', products: [dish] },
  ]
  assert.deepEqual(collectionsOnSurface('restaurant', rows, 'menu').map(row => row.name), ['Wood-Fired Pizza', 'Drinks'])
  assert.deepEqual(collectionsOnSurface('restaurant', rows, 'experiences').map(row => row.name), ['Experiences'])
})

// A chef's counter is one collection the owner named once, holding dishes that
// belong on the menu and a bookable seating that belongs to experiences. The
// public pages already split it that way — /menu never shows the omakase and
// /experiences never shows the dishes — so the CMS opens the same collection on
// both surfaces with each surface's members and no others.
test('a collection holding both a dish and an experience is on both surfaces, split', () => {
  const rows = [{ name: "Chef's Counter", products: [dish, experience] }]

  const onMenu = collectionsOnSurface('restaurant', rows, 'menu')
  assert.deepEqual(onMenu.map(row => row.name), ["Chef's Counter"])
  assert.deepEqual(onMenu[0]!.products, [dish])

  const onExperiences = collectionsOnSurface('restaurant', rows, 'experiences')
  assert.deepEqual(onExperiences.map(row => row.name), ["Chef's Counter"])
  assert.deepEqual(onExperiences[0]!.products, [experience])
})

test('a collection with no member on a surface is not offered there', () => {
  const rows = [{ name: 'Drinks', products: [dish] }]
  assert.deepEqual(collectionsOnSurface('restaurant', rows, 'experiences'), [])
})

test('a collection with nothing in it is offered on every surface until it holds something', () => {
  const rows = [{ name: 'Not yet filled', products: [] as Pick<Product, 'booking'>[] }]
  assert.equal(collectionsOnSurface('restaurant', rows, 'menu').length, 1)
  assert.equal(collectionsOnSurface('restaurant', rows, 'experiences').length, 1)
  const filled = [{ name: 'Not yet filled', products: [dish] }]
  assert.equal(collectionsOnSurface('restaurant', filled, 'experiences').length, 0)
})

test('a pure menu keeps every section on the menu surface', () => {
  const rows = [
    { name: 'Antipasti', products: [dish] },
    { name: 'Drinks', products: [dish, dish] },
  ]
  assert.deepEqual(collectionsOnSurface('restaurant', rows, 'menu').map(row => row.name), ['Antipasti', 'Drinks'])
})
