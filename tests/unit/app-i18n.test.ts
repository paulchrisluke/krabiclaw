import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  APP_DEFAULT_LOCALE,
  normalizeAppLocale,
  resolveAppLocale,
  switchAppLocalePath,
} from '../../utils/app-i18n.ts'

test('English is the immutable application source while canonical paid locales remain valid identifiers', () => {
  assert.equal(APP_DEFAULT_LOCALE, 'en')
  assert.equal(normalizeAppLocale('en'), 'en')
  assert.equal(normalizeAppLocale('th'), 'th')
  assert.equal(normalizeAppLocale(' fr '), 'fr')
  assert.equal(normalizeAppLocale(''), null)
})

test('initial locale resolution uses the explicit default only for absent or invalid input', () => {
  assert.equal(resolveAppLocale(undefined), 'en')
  assert.equal(resolveAppLocale(null), 'en')
  assert.equal(resolveAppLocale('fr'), 'fr')
  assert.equal(resolveAppLocale('th'), 'th')
})

test('locale switching selects only an explicitly published exact route', () => {
  const representations = [
    { locale: 'en', route_path: '/locations/bangkok/menu' },
    { locale: 'th', route_path: '/th/locations/bangkok/menu' },
  ]
  assert.equal(switchAppLocalePath(representations, 'th'), '/th/locations/bangkok/menu')
  assert.equal(switchAppLocalePath(representations, 'en'), '/locations/bangkok/menu')
  assert.equal(switchAppLocalePath(representations, 'fr'), null)
})
