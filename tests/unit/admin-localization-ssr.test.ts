import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../../pages/admin/localization.vue', import.meta.url), 'utf8')

test('admin localization loads its API only after client mount', () => {
  assert.doesNotMatch(source, /\nawait refresh\(\)\s*\n/)
  assert.match(source, /onMounted\(refresh\)/)
})
