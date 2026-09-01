import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const nuxtConfig = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
const tenantPath = readFileSync(new URL('../../pages/[...tenantPath].vue', import.meta.url), 'utf8')
const i18nPlugin = readFileSync(new URL('../../plugins/i18n.ts', import.meta.url), 'utf8')

test('components/localization is registered so <LocalizedResourcePage> resolves at runtime', () => {
  // Regression: this directory was never added to the components scan array,
  // so Vue silently rendered <LocalizedResourcePage> as an empty fragment
  // instead of throwing — every localized resource page (product, location,
  // experience, ...) rendered a blank <main>.
  assert.match(nuxtConfig, /path:\s*'~\/components\/localization'/)
})

test('locale is applied imperatively at route resolution, not via a reactive watch', () => {
  // Regression: plugins/i18n.ts previously bridged useState('public-locale')
  // into vue-i18n via watch(..., { immediate: true }), which only fires once
  // at plugin-init time (locale='en') and is not guaranteed to re-fire in
  // time during SSR before descendant components call t(). The page must
  // call the exposed setter directly, synchronously, in its own setup.
  assert.match(i18nPlugin, /nuxtApp\.provide\('setAppLocale',/)
  assert.doesNotMatch(i18nPlugin, /watch\(\[publicLocale, platformMessages\]/)
  assert.match(tenantPath, /\$setAppLocale\(localizedRoute\.value\.locale, localizedRoute\.value\.platform_messages\)/)
})
