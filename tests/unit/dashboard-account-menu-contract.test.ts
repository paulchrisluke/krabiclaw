import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  new URL('../../lib/components/workspace/dashboard/DashboardAccountMenu.vue', import.meta.url),
  'utf8',
)

test('account menu exposes settings through one responsive dropdown', () => {
  assert.match(source, /label: 'Settings'/)
  assert.doesNotMatch(source, /label: 'Profile'/)
  assert.match(source, /path: '\/dashboard\/account'/)
  assert.equal((source.match(/<UDropdownMenu/g) ?? []).length, 1)
  assert.doesNotMatch(source, /UModal|mobileOpen/)
})

test('account menu keeps theme controls compact and removes stale status work', () => {
  assert.match(source, /class="flex h-10 w-full items-center/)
  assert.doesNotMatch(source, /platformStatus|checkPlatformStatus|\/api\/health/)
})
