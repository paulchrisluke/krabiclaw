import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../../lib/components/workspace/dashboard/DashboardAccountMenu.vue', import.meta.url),
  'utf8',
)

test('account menu exposes settings through one responsive dropdown', () => {
  assert.doesNotMatch(source, /label: 'Profile'/)
  assert.match(source, /path: '\/dashboard\/account'/)
  assert.match(source, /to: settingsTo\.value/)
  assert.match(source, /description: renderedUser\.value\?\.email/)
  assert.match(source, /avatar: \{ src: renderedUser\.value\?\.image/)
  assert.equal((source.match(/<UDropdownMenu/g) ?? []).length, 1)
  assert.doesNotMatch(source, /UModal|mobileOpen/)
})

test('account menu exposes theme choices as keyboard-accessible menu items', () => {
  assert.match(source, /\(\['system', 'light', 'dark'\] as const\)\.map/)
  assert.match(source, /onSelect: \(\) => setPreference\(pref\)/)
  assert.doesNotMatch(source, /<button[^>]*v-for|slot: 'theme'/)
  assert.doesNotMatch(source, /platformStatus|checkPlatformStatus|\/api\/health/)
})
