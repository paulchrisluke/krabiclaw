import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('Today and Calendar use the dashboard shell without placeholder or section cards', () => {
  for (const path of ['pages/dashboard/[orgSlug]/today.vue', 'pages/dashboard/[orgSlug]/calendar.vue']) {
    const source = read(path)
    assert.doesNotMatch(source, /OrganizationPlaceholderPage/)
    assert.doesNotMatch(source, /<UCard\b/)
    assert.equal((source.match(/<UDashboardPanel\b/g) ?? []).length, 1)
    assert.equal((source.match(/<UDashboardNavbar\b/g) ?? []).length, 1)
    assert.match(source, /<DashboardNavbarLeading/)
  }
})

test('Today uses a single divided metric strip and anchor agenda rows', () => {
  const source = read('pages/dashboard/[orgSlug]/today.vue')
  assert.match(source, /aria-label="Today's metrics"/)
  assert.match(source, /divide-x divide-y/)
  assert.match(source, /<AgendaRow v-for="item in schedule"/)
  assert.doesNotMatch(source, />Open</)
})

test('Calendar has separate desktop grid and mobile grouped-list containers with stale-response protection', () => {
  const source = read('pages/dashboard/[orgSlug]/calendar.vue')
  assert.match(source, /hidden overflow-hidden[^>]+md:block/)
  assert.match(source, /space-y-8 md:hidden/)
  assert.match(source, /href="#calendar-day-list"/)
  assert.match(source, /if \(requestedKey !== requestKey\.value\) return/)
  assert.match(source, /const FILTER_ALL = '__all__'/)
})
