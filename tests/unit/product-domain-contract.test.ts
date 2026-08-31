import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  validateProductOrderUrl,
} from '../../server/utils/product-validation.ts'
import { resolveProductPresentation } from '../../utils/product-presentation.ts'

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
  const sayaButton = readFileSync(new URL('../../components/saya/SayaButton.vue', import.meta.url), 'utf8')
  const analytics = readFileSync(new URL('../../server/api/public/sites/[siteId]/conversion-events.post.ts', import.meta.url), 'utf8')

  assert.match(detail, /v-if="product\.available && product\.order_url"/)
  assert.match(detail, /<SayaButton/)
  assert.match(detail, /target="_blank"/)
  assert.match(detail, /rel="noopener noreferrer"/)
  assert.match(detail, />Order Now<\/SayaButton>/)
  assert.match(sayaButton, /:target="target"/)
  assert.match(sayaButton, /:rel="rel"/)
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
