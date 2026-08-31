import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const footerSource = await readFile(new URL('../../components/saya/SayaFooter.vue', import.meta.url), 'utf8')

test('footer language menu does not apply the full-page Saya shell class', () => {
  assert.doesNotMatch(footerSource, /<SayaDropdown[^>]*panel-class="saya-theme"/)
})
