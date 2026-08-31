import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  indexStoredPublicLocalizations,
  projectExactLocalizedCollection,
  projectExactLocalizedResource,
  projectLocalizedMediaAlt,
  resolveLocalizedRouteResourceId,
} from '../../server/utils/public-localization.ts'

const price = { id: 'price-1', amount_minor: 45000, currency: 'THB' }
const image = { asset_id: 'asset-1', public_url: 'https://images.example/dish.jpg', alt_text: 'Source alt' }

test('exact Product projection retains operational price and media while replacing only registered text', () => {
  const [localization] = indexStoredPublicLocalizations([{
    resource_type: 'product',
    resource_id: 'product-1',
    locale: 'th',
    values_json: JSON.stringify({
      category: 'อาหารจานหลัก',
      name: 'ข้าวซอย',
      description: 'เส้นบะหมี่แกงเหนือ',
      tags_json: ['เผ็ด'],
      details_json: [{ key: 'diet', label: 'อาหาร', values: ['มังสวิรัติ'] }],
    }),
    route_path: '/th/locations/ao-nang/menu/khao-soi',
  }])
  assert.ok(localization)

  const projected = projectExactLocalizedResource('product', {
    id: 'product-1',
    category: 'Mains',
    name: 'Khao Soi',
    slug: 'khao-soi-en',
    description: 'Northern curry noodles',
    tags: ['spicy'],
    details: [],
    price,
    image,
    gallery: [image],
    seo_title: null,
    seo_description: null,
  }, localization)

  assert.deepEqual(projected, {
    id: 'product-1',
    category: 'อาหารจานหลัก',
    name: 'ข้าวซอย',
    slug: 'khao-soi',
    description: 'เส้นบะหมี่แกงเหนือ',
    tags: ['เผ็ด'],
    details: [{ key: 'diet', label: 'อาหาร', values: ['มังสวิรัติ'] }],
    price,
    image,
    gallery: [image],
    seo_title: null,
    seo_description: null,
  })
})

test('media stays available while untranslated English alt text is removed', () => {
  const localizations = indexStoredPublicLocalizations([{
    resource_type: 'media_asset',
    resource_id: 'asset-1',
    locale: 'th',
    values_json: JSON.stringify({ alt_text: 'ข้าวซอยในชาม' }),
    route_path: null,
  }])

  assert.deepEqual(projectLocalizedMediaAlt([
    { asset_id: 'asset-1', public_url: 'https://images.example/one.jpg', alt_text: 'Khao soi bowl' },
    { asset_id: 'asset-2', public_url: 'https://images.example/two.jpg', alt_text: 'Dining room' },
  ], localizations), [
    { asset_id: 'asset-1', public_url: 'https://images.example/one.jpg', alt_text: 'ข้าวซอยในชาม' },
    { asset_id: 'asset-2', public_url: 'https://images.example/two.jpg', alt_text: null },
  ])
})

test('localized collections omit source rows without an exact representation', () => {
  const localizations = indexStoredPublicLocalizations([{
    resource_type: 'product',
    resource_id: 'product-1',
    locale: 'th',
    values_json: JSON.stringify({ category: 'อาหาร', name: 'แกง' }),
    route_path: '/th/locations/ao-nang/menu/curry',
  }])

  assert.deepEqual(projectExactLocalizedCollection('product', [
    { id: 'product-1', category: 'Mains', name: 'Curry', slug: 'curry-en' },
    { id: 'product-2', category: 'Mains', name: 'Soup', slug: 'soup-en' },
  ], localizations), [
    { id: 'product-1', category: 'อาหาร', name: 'แกง', slug: 'curry', description: null, tags: [], details: [], seo_title: null, seo_description: null },
  ])
})

test('exact projection clears every untranslated optional source field', () => {
  const source = {
    id: 'product-1',
    category: 'Tea',
    name: 'English tea',
    description: 'English description',
    tags: ['English tag'],
    details: [{ key: 'origin', label: 'Origin', values: ['Thailand'] }],
    seo_title: 'English SEO',
    seo_description: 'English SEO description',
  }
  const [localization] = indexStoredPublicLocalizations([{
    resource_type: 'product',
    resource_id: 'product-1',
    locale: 'th',
    values_json: JSON.stringify({ category: 'ชา', name: 'ชาไทย' }),
    route_path: '/th/locations/ao-nang/menu/tea',
  }])
  assert.ok(localization)
  const localized = projectExactLocalizedResource('product', source, localization)
  assert.equal(localized.description, '')
  assert.deepEqual(localized.tags, [])
  assert.deepEqual(localized.details, [])
  assert.equal(localized.seo_title, '')
  assert.equal(localized.seo_description, '')
})

test('Experience pricing copy cannot overwrite the canonical Price object', () => {
  const [localization] = indexStoredPublicLocalizations([{
    resource_type: 'experience',
    resource_id: 'experience-1',
    locale: 'th',
    values_json: JSON.stringify({ title: 'ชั้นเรียนทำอาหาร', pricing_note: 'สอบถามราคา' }),
    route_path: '/th/experiences/cooking-class',
  }])
  assert.ok(localization)

  const projected = projectExactLocalizedResource('experience', {
    id: 'experience-1',
    title: 'Cooking class',
    slug: 'cooking-class-en',
    pricing_note: 'Ask for pricing',
    price,
  }, localization)

  assert.equal(projected.pricing_note, 'สอบถามราคา')
  assert.equal(projected.price, price)
  assert.equal(projected.slug, 'cooking-class')
})

test('localized route lookup resolves the canonical resource ID without guessing a source slug', () => {
  const localizations = indexStoredPublicLocalizations([{
    resource_type: 'business_location',
    resource_id: 'location-1',
    locale: 'th',
    values_json: JSON.stringify({ title: 'อ่าวนาง' }),
    route_path: '/th/locations/ao-nang-th',
  }])

  assert.equal(resolveLocalizedRouteResourceId(localizations, 'business_location', '/th/locations/ao-nang-th'), 'location-1')
  assert.equal(resolveLocalizedRouteResourceId(localizations, 'business_location', '/th/locations/missing'), null)
})
