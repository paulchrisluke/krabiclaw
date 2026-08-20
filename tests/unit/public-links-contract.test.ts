import assert from 'node:assert/strict'
import test from 'node:test'
import { isPublicLinksPayload, isPublicLinksResponse } from '../../utils/public-links-contract'

const payload = {
  site: {
    id: 'site-demo',
    organization_id: 'org-demo',
    brand_name: 'Ember & Slice',
    brand_description: null,
    logo_url: null,
    brand_color: '#C2410C',
    theme_id: 'saya-theme-v1',
    vertical: 'restaurant',
    template: 'saya',
  },
  page: {
    id: 'links-page-demo',
    organization_id: 'org-demo',
    site_id: 'site-demo',
    path: '/links',
    title: 'Links',
    robots: 'noindex,follow',
    seo_title: null,
    seo_description: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by: null,
  },
  items: [{
    id: 'link-demo',
    organization_id: 'org-demo',
    site_id: 'site-demo',
    link_page_id: 'links-page-demo',
    label: 'Menu',
    destination: '/menu',
    sort_order: 0,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    updated_by: null,
  }],
}

test('public links validator accepts the canonical server payload and API envelope', () => {
  assert.equal(isPublicLinksPayload(payload), true)
  assert.equal(isPublicLinksResponse({ success: true, ...payload }), true)
})

test('public links validator rejects malformed or unsuccessful responses', () => {
  assert.equal(isPublicLinksPayload({ ...payload, items: [{ ...payload.items[0], destination: 42 }] }), false)
  assert.equal(isPublicLinksResponse({ success: false, ...payload }), false)
})
