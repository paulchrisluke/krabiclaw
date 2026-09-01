import assert from 'node:assert/strict'
import test from 'node:test'

import {
  indexStoredPublicLocalizations,
  projectExactLocalizedCollection,
  projectExactLocalizedResource,
  projectLocalizedMediaAlt,
  resolveLocalizedRouteResourceId,
  type StoredPublicLocalizationRow,
} from '~/server/utils/public-localization'

test('projectExactLocalizedResource overlays only the localized fields, leaving canonical fields untouched', () => {
  const canonical = { id: 'item-1', name: 'Tuna Sushi', category: 'Sushi', description: 'Tuna', price: 75, slug: 'tuna-sushi' }
  const localization = {
    resourceType: 'product' as const,
    resourceId: 'item-1',
    locale: 'th',
    values: { name: 'ทูน่าซูชิ', category: 'ซูชิ' },
    routePath: '/th/locations/kikuzuki/menu/tuna-sushi',
  }
  const result = projectExactLocalizedResource('product', canonical, localization)
  assert.equal(result.name, 'ทูน่าซูชิ')
  assert.equal(result.category, 'ซูชิ')
  // description has no Thai value in this localization row — must clear to
  // the field's empty shape rather than leaking the English source text.
  assert.equal(result.description, '')
  // price is not a localized field at all — untouched.
  assert.equal(result.price, 75)
  assert.equal(result.slug, 'tuna-sushi')
})

test('projectExactLocalizedResource rejects a localization for the wrong resource', () => {
  const canonical = { id: 'item-1', name: 'Tuna Sushi', category: 'Sushi' }
  const localization = {
    resourceType: 'product' as const,
    resourceId: 'item-2',
    locale: 'th',
    values: { name: 'x', category: 'y' },
    routePath: null,
  }
  assert.throws(() => projectExactLocalizedResource('product', canonical, localization))
})

test('projectExactLocalizedCollection drops canonical rows that have no translation for the locale', () => {
  const canonical = [
    { id: 'item-1', name: 'Tuna Sushi', category: 'Sushi' },
    { id: 'item-2', name: 'Salmon Sushi', category: 'Sushi' },
  ]
  const localizations = [{
    resourceType: 'product' as const,
    resourceId: 'item-1',
    locale: 'th',
    values: { name: 'ทูน่าซูชิ', category: 'ซูชิ' },
    routePath: null,
  }]
  const result = projectExactLocalizedCollection('product', canonical, localizations)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, 'item-1')
  assert.equal(result[0]?.name, 'ทูน่าซูชิ')
})

test('resolveLocalizedRouteResourceId matches by exact route_path within the requested resource type', () => {
  const localizations = [
    { resourceType: 'business_location' as const, resourceId: 'loc-1', locale: 'th', values: {}, routePath: '/th/locations/kikuzuki' },
    { resourceType: 'experience' as const, resourceId: 'exp-1', locale: 'th', values: {}, routePath: '/th/locations/kikuzuki' },
  ]
  assert.equal(resolveLocalizedRouteResourceId(localizations, 'business_location', '/th/locations/kikuzuki'), 'loc-1')
  assert.equal(resolveLocalizedRouteResourceId(localizations, 'experience', '/th/locations/kikuzuki'), 'exp-1')
  assert.equal(resolveLocalizedRouteResourceId(localizations, 'business_location', '/th/locations/nope'), null)
})

test('projectLocalizedMediaAlt overlays alt_text per asset id and falls back to null, not the source alt', () => {
  const media = [
    { asset_id: 'asset-1', alt_text: 'English alt' },
    { asset_id: 'asset-2', alt_text: 'English alt 2' },
  ]
  const localizations = [{
    resourceType: 'media_asset' as const,
    resourceId: 'asset-1',
    locale: 'th',
    values: { alt_text: 'ข้อความแทนภาพ' },
    routePath: null,
  }]
  const result = projectLocalizedMediaAlt(media, localizations)
  assert.equal(result[0]?.alt_text, 'ข้อความแทนภาพ')
  assert.equal(result[1]?.alt_text, null)
})

test('indexStoredPublicLocalizations parses stored JSON rows and validates each against the registry', () => {
  const rows: StoredPublicLocalizationRow[] = [{
    resource_type: 'product',
    resource_id: 'item-1',
    locale: 'th',
    values_json: JSON.stringify({ name: 'ทูน่าซูชิ', category: 'ซูชิ' }),
    route_path: null,
  }]
  const result = indexStoredPublicLocalizations(rows)
  assert.equal(result.length, 1)
  assert.equal(result[0]?.values.name, 'ทูน่าซูชิ')
})
