import assert from 'node:assert/strict'
import { test } from 'node:test'
import englishManifest from '../../i18n/locales/en.json' with { type: 'json' }
import thaiCatalog from '../../i18n/catalogs/th.json' with { type: 'json' }
import {
  flattenLocaleManifest,
  localeManifestHash,
  validateLocaleCatalog,
} from '../../shared/platform-locale-catalog.ts'

const SOURCE_MANIFEST_HASH = 'b8dcca33f1698ae9244a7e0f9b2588b5f729329200a892829ed8e4ad3d8b89cb'
const THAI_TRANSLATION_SOURCE = {
  file: 'KrabiClaw Thai Translations.md',
  sha256: '3496388f22b959f6909b8f4d64afdc0a0d9514ceb2bbcc12baaa1fb2e11e48e1',
} as const

test('the English platform manifest has a stable flattened contract', async () => {
  const messages = flattenLocaleManifest(englishManifest)

  assert.equal(Object.keys(messages).length, 228)
  assert.equal(await localeManifestHash(messages), SOURCE_MANIFEST_HASH)
})

test('complete catalogs require exact keys, non-blank values, and matching placeholders', () => {
  const source = flattenLocaleManifest(englishManifest)
  const validMessages = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, `Thai ${value}`]))

  assert.deepEqual(validateLocaleCatalog(source, validMessages, { complete: true }), {
    ok: true,
    messages: validMessages,
  })

  const missingMessages = { ...validMessages }
  delete missingMessages['saya.hero.view_menu']
  assert.deepEqual(validateLocaleCatalog(source, missingMessages, { complete: true }), {
    ok: false,
    issue: { kind: 'coverage', missing: ['saya.hero.view_menu'], extra: [] },
  })

  assert.deepEqual(validateLocaleCatalog(source, { ...validMessages, unknown: 'เกิน' }, { complete: true }), {
    ok: false,
    issue: { kind: 'coverage', missing: [], extra: ['unknown'] },
  })

  assert.deepEqual(validateLocaleCatalog(source, { ...validMessages, 'saya.hero.view_menu': '  ' }, { complete: true }), {
    ok: false,
    issue: { kind: 'coverage', missing: ['saya.hero.view_menu'], extra: [] },
  })

  assert.deepEqual(validateLocaleCatalog(source, { ...validMessages, 'saya.hero.established': 'ก่อตั้ง' }, { complete: true }), {
    ok: false,
    issue: {
      kind: 'placeholder',
      key: 'saya.hero.established',
      expected: ['year'],
      actual: [],
    },
  })
})

test('draft catalogs may omit blank messages but may not introduce unknown keys', () => {
  const source = flattenLocaleManifest(englishManifest)

  assert.deepEqual(validateLocaleCatalog(source, { 'saya.hero.view_menu': 'ดูเมนู', 'saya.header.menu': '' }, { complete: false }), {
    ok: true,
    messages: { 'saya.hero.view_menu': 'ดูเมนู' },
  })
})

test('the approved Thai artifact exactly satisfies the English manifest', () => {
  const source = flattenLocaleManifest(englishManifest)
  const validation = validateLocaleCatalog(source, thaiCatalog, { complete: true })

  assert.equal(THAI_TRANSLATION_SOURCE.file, 'KrabiClaw Thai Translations.md')
  assert.match(THAI_TRANSLATION_SOURCE.sha256, /^[a-f0-9]{64}$/)
  assert.equal(Object.keys(thaiCatalog).length, 228)
  assert.deepEqual(validation, { ok: true, messages: thaiCatalog })

  const valuesWithoutThaiScript = Object.entries(thaiCatalog)
    .filter(([, value]) => !/[\u0E00-\u0E7F]/.test(value))
  assert.deepEqual(valuesWithoutThaiScript, [['saya.location.apple_maps', 'Apple Maps']])
  assert.equal(thaiCatalog['saya.footer.heading_connect'], 'เชื่อมต่อ')
  assert.equal(thaiCatalog['saya.footer.powered_by'], 'ขับเคลื่อนโดย krabiclaw.com')
})
