import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../../lib/components/workspace/settings/SiteSettingsPage.vue', import.meta.url),
  'utf8',
)

test('site language enable submits the catalog label required by the endpoint', () => {
  assert.match(
    source,
    /mutateLocalization\(`\/api\/editor\/sites\/\$\{siteId\}\/locales\/\$\{encodeURIComponent\(newLocale\.value\)\}\/enable`, 'POST', \{ label: selectedCatalog\.label \}\)/,
  )
})
