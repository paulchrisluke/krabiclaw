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

test('account menu routes organization settings without duplicating appearance controls', () => {
  assert.match(source, /label: 'Settings'/)
  assert.match(source, /to: organizationSettingsTo\.value/)
  assert.doesNotMatch(source, /setPreference|slot: 'theme'|label: 'Theme'/)
  assert.doesNotMatch(source, /platformStatus|checkPlatformStatus|\/api\/health/)
})
