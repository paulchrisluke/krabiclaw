import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  normalizeRequiredProductPrice,
  validateProductOrderUrl,
  validateProductSale,
} from '../../server/utils/product-validation.ts'
import { formatProductMoney } from '../../utils/product-money.ts'
import { resolveProductPresentation } from '../../utils/product-presentation.ts'

test('Product prices normalize canonically and reject ambiguous display fallbacks', () => {
  assert.equal(normalizeRequiredProductPrice('0'), '0')
  assert.equal(normalizeRequiredProductPrice('12.3400'), '12.34')
  assert.equal(normalizeRequiredProductPrice(150), '150')
  for (const value of ['', '-1', '.5', '01', '12.', 'THB 100', Number.NaN]) {
    assert.throws(() => normalizeRequiredProductPrice(value))
  }
  assert.equal(formatProductMoney('12.34', 'THB'), '฿12.34')
  assert.throws(() => formatProductMoney('12.', 'THB'))
})

test('Product sale validation rejects incomplete and inverted sale states', () => {
  assert.deepEqual(validateProductSale({ price_amount: '100', compare_at_price_amount: '120.00', sale_starts_at: '2026-09-01', sale_ends_at: '2026-09-30' }), {
    priceAmount: '100',
    compareAtPriceAmount: '120',
    saleStartsAt: '2026-09-01',
    saleEndsAt: '2026-09-30',
  })
  assert.throws(() => validateProductSale({ price_amount: '100', sale_starts_at: '2026-09-01' }))
  assert.throws(() => validateProductSale({ price_amount: '100', compare_at_price_amount: '100' }))
  assert.throws(() => validateProductSale({ price_amount: '100', compare_at_price_amount: '120', sale_starts_at: '2026-09-30', sale_ends_at: '2026-09-01' }))
  assert.throws(() => validateProductSale({ price_amount: '100', compare_at_price_amount: '120', sale_starts_at: '2026-02-30' }))
})

test('Product order URLs accept only absolute credential-free HTTPS destinations', () => {
  assert.equal(validateProductOrderUrl('https://orders.example.com/item/1'), 'https://orders.example.com/item/1')
  for (const value of ['http://orders.example.com', '/order', 'https://user:secret@orders.example.com', 'javascript:alert(1)', 'https://orders.example.com/#javascript%3Aalert(1)']) {
    assert.throws(() => validateProductOrderUrl(value))
  }
})

test('Product presentation keeps one internal domain and location-scoped public identities', () => {
  const restaurant = resolveProductPresentation('restaurant')
  const experience = resolveProductPresentation('experience')
  assert.equal(restaurant?.feature, 'products')
  assert.equal(restaurant?.productPath('old-town', 'tea'), '/locations/old-town/menu/tea')
  assert.equal(experience?.feature, 'products')
  assert.equal(experience?.productPath('studio', 'clay-kit'), '/locations/studio/products/clay-kit')
  assert.equal(resolveProductPresentation('professional_service'), null)
})

test('Product detail metadata receives the canonical site brand from its API payload', () => {
  const composable = readFileSync(new URL('../../composables/usePublicProductDetail.ts', import.meta.url), 'utf8')
  const menuPage = readFileSync(new URL('../../pages/locations/[slug]/menu/[productSlug].vue', import.meta.url), 'utf8')
  const productsPage = readFileSync(new URL('../../pages/locations/[slug]/products/[productSlug].vue', import.meta.url), 'utf8')

  assert.match(composable, /brandName: detail\.site\.brand_name/)
  assert.doesNotMatch(composable, /brandName: String\(/)
  assert.match(menuPage, /brand: \{ siteName: detail\.value\.brandName \}/)
  assert.match(productsPage, /brand: \{ siteName: detail\.value\.brandName \}/)
  assert.doesNotMatch(`${menuPage}\n${productsPage}`, /siteName: ''/)
})

test('site preview collection routes use index files beside Product detail routes', () => {
  const previewRoutes = [
    '../../pages/preview/site/[siteId]/locations/[slug]/menu',
    '../../pages/preview/site/[siteId]/locations/[slug]/products',
  ]

  for (const route of previewRoutes) {
    assert.equal(existsSync(new URL(`${route}/index.vue`, import.meta.url)), true)
    assert.equal(existsSync(new URL(`${route}/[productSlug].vue`, import.meta.url)), true)
    assert.equal(existsSync(new URL(`${route}.vue`, import.meta.url)), false)
  }
})

test('external Product ordering renders only the canonical link and records hostname-only analytics', () => {
  const detail = readFileSync(new URL('../../components/products/ProductDetailPage.vue', import.meta.url), 'utf8')
  const analytics = readFileSync(new URL('../../server/api/public/sites/[siteId]/conversion-events.post.ts', import.meta.url), 'utf8')

  assert.match(detail, /v-if="product\.available && product\.order_url"/)
  assert.match(detail, /target="_blank"/)
  assert.match(detail, /rel="noopener noreferrer"/)
  assert.match(detail, />Order Now<\/a>/)
  assert.doesNotMatch(detail, /\/order|Grab|Uber Eats|Foodpanda/)
  assert.match(analytics, /destinationHostname = new URL\(product\.order_url\)\.hostname/)
  assert.match(analytics, /ctaDestination = destinationHostname/)
  assert.match(analytics, /destination_hostname: destinationHostname/)
})

test('Product editor keeps the form open and exposes delete and primary-image failures', () => {
  const editor = readFileSync(new URL('../../components/products/ProductEditor.vue', import.meta.url), 'utf8')

  assert.match(editor, /Failed to delete Product/)
  assert.match(editor, /Failed to update primary image/)
  assert.match(editor, /catch \(cause\)/)
})

test('Product schema and migration enforce location identity without rebuilding sites', () => {
  const schema = readFileSync(new URL('../../server/db/schema.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../migrations/0132_conscious_micromax.sql', import.meta.url), 'utf8')
  const preflight = readFileSync(new URL('../../scripts/preflight-product-migration.mjs', import.meta.url), 'utf8')

  assert.match(schema, /unique\("products_site_location_slug_unique"\)\.on\(table\.site_id, table\.location_id, table\.slug\)/)
  assert.match(schema, /name: "products_location_scope_fk"/)
  assert.match(migration, /CREATE TRIGGER `sites_default_currency_insert_guard`/)
  assert.match(migration, /NEW\.`default_currency` NOT IN \('THB','USD'/)
  assert.doesNotMatch(migration, /trim\(NEW\.`default_currency`\)/)
  assert.doesNotMatch(migration, /(?:DROP|ALTER) TABLE `?sites`?/i)
  assert.match(preflight, /sites\.default_currency must already be enforced as NOT NULL/)
  assert.match(preflight, /SELECT id, default_currency FROM sites ORDER BY id/)
  assert.doesNotMatch(preflight, /default_currency FROM sites WHERE status = 'active'/)
  assert.match(migration, /`price_amount` NOT LIKE '%\.0'/)
  assert.match(migration, /substr\(`price_amount`, -1\) <> '0'/)
})
