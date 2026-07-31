import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = async (path: string) =>
  await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

test('API clients use the fixed performance timeouts and disable retry', async () => {
  const [clients, dashboard] = await Promise.all([
    source('utils/api-clients.ts'),
    source('composables/dashboardFetch.ts'),
  ])
  assert.match(clients, /PUBLIC_READ_TIMEOUT_MS = 6_000/)
  assert.match(clients, /DASHBOARD_READ_TIMEOUT_MS = 8_000/)
  assert.match(clients, /MUTATION_TIMEOUT_MS = 15_000/)
  assert.match(clients, /retry:\s*0/)
  assert.match(dashboard, /retry:\s*0/)
})

test('public shell excludes full menu and experience list requests', async () => {
  const shell = await source('composables/useSiteShell.ts')
  assert.match(shell, /menu:\s*false/)
  assert.doesNotMatch(shell, /experiencesList:\s*Experience\[\]/)
})

test('availability and policy loaders use bulk indexed queries', async () => {
  const [experiences, policies] = await Promise.all([
    source('server/utils/experiences.ts'),
    source('server/utils/booking-policies.ts'),
  ])
  assert.match(experiences, /experience_id IN \(\$\{experiencePlaceholders\}\)/)
  assert.match(experiences, /GROUP BY experience_id, booking_date, time_slot/)
  assert.match(policies, /resolveBookingPolicyIndex/)
  assert.match(policies, /WHERE site_id = \? AND policy_type = \?/)
})

test('dashboard transport does not mutate global fetch', async () => {
  const files = await Promise.all([
    source('composables/dashboardFetch.ts'),
    source('composables/useDashboardSite.ts'),
  ])
  assert.equal(files.some(value => value.includes('globalThis.$fetch')), false)
})
