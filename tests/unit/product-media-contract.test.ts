import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AppDb } from '~/server/db'
import { getProduct } from '~/server/utils/product-management'

function fakeDb(product: Record<string, unknown>, mediaRows: Record<string, unknown>[]) {
  return {
    $client: {} as D1Database,
    async get() {
      return product
    },
    async all() {
      return mediaRows
    },
  } as unknown as AppDb
}

const productRow = {
  id: 'product-1',
  organization_id: 'org-1',
  site_id: 'site-1',
  location_id: 'location-1',
  category: 'Clay Snacks',
  name: 'Painted Bowl',
  slug: 'painted-bowl',
  description: 'A tiny bowl.',
  price_id: 'price-1',
  amount_minor: 100000,
  currency: 'THB',
  unit: 'item',
  tax_behavior: 'unspecified',
  compare_at_amount_minor: null,
  valid_from: '2026-01-01T00:00:00.000Z',
  valid_until: null,
  provenance: 'test',
  price_created_by: 'user-1',
  price_created_at: '2026-01-01T00:00:00.000Z',
  order_url: null,
  is_visible: 1,
  available: 1,
  featured: 0,
  featured_sort_order: 0,
  sort_order: 0,
  tags_json: '[]',
  details_json: '[]',
  seo_title: null,
  seo_description: null,
  canonical_url: null,
  robots: null,
  source: 'manual',
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  created_by: 'user-1',
  updated_by: 'user-1',
}

function mediaRow(input: { id: string; slot: 'image' | 'gallery'; sortOrder: number }) {
  return {
    id: input.id,
    asset_id: input.id,
    placement_id: `placement-${input.id}`,
    owner_id: 'product-1',
    slot: input.slot,
    sort_order: input.sortOrder,
    organization_id: 'org-1',
    site_id: 'site-1',
    provider: 'cloudflare_r2',
    source: 'uploaded',
    cloudflare_image_id: null,
    r2_key: `images/${input.id}.jpg`,
    public_url: `https://cdn.example.com/${input.id}.jpg`,
    thumbnail_url: null,
    mime_type: 'image/jpeg',
    file_name: `${input.id}.jpg`,
    file_size: 456,
    width: 1200,
    height: 900,
    duration: null,
    alt_text: input.id,
    category: 'menu',
    status: 'active',
    created_by_user_id: 'user-1',
    kind: 'image',
    created_at: '2026-07-31T00:00:00.000Z',
    updated_at: '2026-07-31T00:00:00.000Z',
  }
}

test('Product media keeps explicit primary separate from the ordered detail gallery', async () => {
  const product = await getProduct(
    fakeDb(productRow, [
      mediaRow({ id: 'asset-primary', slot: 'image', sortOrder: 0 }),
      mediaRow({ id: 'asset-gallery-1', slot: 'gallery', sortOrder: 0 }),
      mediaRow({ id: 'asset-gallery-2', slot: 'gallery', sortOrder: 1 }),
    ]),
    'org-1',
    'site-1',
    'location-1',
    'product-1',
  )

  assert.equal(product?.image?.asset_id, 'asset-primary')
  assert.deepEqual(product?.gallery.map(media => media.asset_id), ['asset-gallery-1', 'asset-gallery-2'])
})

test('Product with no explicit image does not fall back to its gallery', async () => {
  const product = await getProduct(
    fakeDb(productRow, [mediaRow({ id: 'asset-gallery', slot: 'gallery', sortOrder: 0 })]),
    'org-1',
    'site-1',
    'location-1',
    'product-1',
  )

  assert.equal(product?.image, null)
  assert.deepEqual(product?.gallery.map(media => media.asset_id), ['asset-gallery'])
})

test('Product editor sends the canonical primary-image placement object', () => {
  const editor = readFileSync(new URL('../../components/products/ProductEditor.vue', import.meta.url), 'utf8')

  assert.match(editor, /placement: \{ owner_type: 'product', owner_id: product\.id, slot: 'image' \}/)
  assert.doesNotMatch(editor, /placement: `product:/)
})
