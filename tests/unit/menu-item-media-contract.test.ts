import assert from 'node:assert/strict'
import test from 'node:test'
import { getMenuWithItems } from '~/server/utils/menu-management'
import type { AppDb } from '~/server/db'

function fakeDb(input: {
  menu: Record<string, unknown>
  items: Record<string, unknown>[]
  mediaRows: Record<string, unknown>[]
}) {
  let allCalls = 0
  return {
    $client: {} as D1Database,
    async get() {
      return input.menu
    },
    async all() {
      allCalls += 1
      if (allCalls === 1) return input.items
      if (allCalls === 2) {
        return [...input.mediaRows].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      }
      return []
    },
  } as unknown as AppDb
}

const menuRow = {
  id: 'menu-1',
  organization_id: 'org-1',
  site_id: 'site-1',
  name: 'Menu',
  description: null,
  status: 'published',
  section_order: '["Clay Snacks"]',
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  created_by: 'user-1',
  updated_by: null,
}

const itemRow = {
  id: 'item-1',
  menu_id: 'menu-1',
  section: 'Clay Snacks',
  name: 'Painted Bowl',
  slug: 'painted-bowl',
  description: 'A tiny bowl.',
  price_amount: '1000',
  compare_at_price_amount: null,
  sale_starts_at: null,
  sale_ends_at: null,
  available: 1,
  featured: 0,
  featured_sort_order: 0,
  sort_order: 0,
  allergens: null,
  ingredients: null,
  dietary_notes: null,
  preparation: null,
  serving_note: null,
  seo_title: null,
  seo_description: null,
  canonical_url: null,
  robots: null,
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  created_by: 'user-1',
  updated_by: null,
}

test('menu item without placements has no media', async () => {
  const menu = await getMenuWithItems(
    fakeDb({ menu: menuRow, items: [itemRow], mediaRows: [] }),
    'org-1',
    'site-1',
    'menu-1',
  )

  assert.deepEqual(menu?.items[0]?.media, [])
})

test('menu item media is hydrated from ordered placements', async () => {
  const menu = await getMenuWithItems(
    fakeDb({
      menu: menuRow,
      items: [itemRow],
      mediaRows: [
        {
          ...itemRow,
          id: 'asset-image',
          asset_id: 'asset-image',
          placement_id: 'placement-image',
          owner_id: 'item-1',
          slot: 'gallery',
          sort_order: 1,
          organization_id: 'org-1',
          site_id: 'site-1',
          provider: 'cloudflare_r2',
          source: 'uploaded',
          cloudflare_image_id: null,
          r2_key: 'images/asset-image.jpg',
          public_url: 'https://cdn.example.com/image.jpg',
          thumbnail_url: 'https://cdn.example.com/image-thumb.jpg',
          mime_type: 'image/jpeg',
          file_name: 'image.jpg',
          file_size: 456,
          width: 1200,
          height: 900,
          duration: null,
          alt_text: 'Finished bowl',
          category: 'menu',
          status: 'active',
          created_by_user_id: 'user-1',
          kind: 'image',
        },
        {
          ...itemRow,
          id: 'asset-video',
          asset_id: 'asset-video',
          placement_id: 'placement-video',
          owner_id: 'item-1',
          slot: 'gallery',
          sort_order: 0,
          organization_id: 'org-1',
          site_id: 'site-1',
          provider: 'cloudflare_r2',
          source: 'uploaded',
          cloudflare_image_id: null,
          r2_key: 'videos/asset-video.mp4',
          public_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/video-poster.jpg',
          mime_type: 'video/mp4',
          file_name: 'video.mp4',
          file_size: 123,
          width: 1080,
          height: 1920,
          duration: 6,
          alt_text: 'Painting a bowl',
          category: 'menu',
          status: 'active',
          created_by_user_id: 'user-1',
          kind: 'video',
        },
      ],
    }),
    'org-1',
    'site-1',
    'menu-1',
  )

  assert.deepEqual(menu?.items[0]?.media?.map(media => media.asset_id), ['asset-video', 'asset-image'])
})
