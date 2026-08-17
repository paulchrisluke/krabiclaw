import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  APP_DEFAULT_LOCALE,
  APP_LOCALES,
  normalizeAppLocale,
  resolveAppLocale,
  switchAppLocalePath,
} from '../../utils/app-i18n.ts'

test('the application locale registry preserves the configured locales and default', () => {
  assert.deepEqual(APP_LOCALES.map(locale => locale.code), ['en', 'th'])
  assert.equal(APP_DEFAULT_LOCALE, 'en')
  assert.equal(normalizeAppLocale('en'), 'en')
  assert.equal(normalizeAppLocale('th'), 'th')
  assert.equal(normalizeAppLocale(' fr '), null)
  assert.equal(normalizeAppLocale(''), null)
})

test('initial locale resolution uses the explicit default only for absent or invalid input', () => {
  assert.equal(resolveAppLocale(undefined), 'en')
  assert.equal(resolveAppLocale(null), 'en')
  assert.equal(resolveAppLocale('fr'), 'en')
  assert.equal(resolveAppLocale('th'), 'th')
})

test('no-prefix locale switching preserves the complete current URL', () => {
  const currentPath = '/locations/bangkok/menu?preview=true&token=abc#details'
  assert.equal(switchAppLocalePath(currentPath, 'th'), currentPath)
  assert.equal(switchAppLocalePath(currentPath, 'en'), currentPath)
  assert.equal(switchAppLocalePath(currentPath, 'fr'), null)
})
