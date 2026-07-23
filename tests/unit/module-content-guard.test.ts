import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const fixtures = {
  menuItemRow: null as { id: string } | null,
  experienceRow: null as { id: string } | null,
  reservationRow: null as { id: string } | null,
  orderingLocationRow: null as { id: string } | null,
  offeringRow: null as { id: string } | null,
}

function reset() {
  fixtures.menuItemRow = null
  fixtures.experienceRow = null
  fixtures.reservationRow = null
  fixtures.orderingLocationRow = null
  fixtures.offeringRow = null
}

async function queryFirst<T>(_db: unknown, query: string): Promise<T | null> {
  if (query.includes('FROM menu_items')) return fixtures.menuItemRow as T | null
  if (query.includes('FROM experiences')) return fixtures.experienceRow as T | null
  if (query.includes('FROM reservation_submissions')) return fixtures.reservationRow as T | null
  if (query.includes('FROM business_locations')) return fixtures.orderingLocationRow as T | null
  if (query.includes('FROM offerings')) return fixtures.offeringRow as T | null
  return null
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst },
})

const { checkModuleHasLiveData } = await import('../../server/utils/module-content-guard.ts')

const db = {} as D1Database
const scope = { siteId: 'site-1' }

test('a module with no live-data check (e.g. an unrecognized feature) never blocks', async () => {
  reset()
  const result = await checkModuleHasLiveData(db, scope, 'blog')
  assert.equal(result.blocked, false)
})

test('menu is blocked when an available menu item exists', async () => {
  reset()
  fixtures.menuItemRow = { id: 'menu-item-1' }
  const result = await checkModuleHasLiveData(db, scope, 'menu')
  assert.equal(result.blocked, true)
  assert.match(result.reason ?? '', /menu items/)
})

test('menu is not blocked when no menu items exist', async () => {
  reset()
  const result = await checkModuleHasLiveData(db, scope, 'menu')
  assert.equal(result.blocked, false)
})

test('experiences is blocked when an active experience exists', async () => {
  reset()
  fixtures.experienceRow = { id: 'exp-1' }
  const result = await checkModuleHasLiveData(db, scope, 'experiences')
  assert.equal(result.blocked, true)
})

test('reservations is blocked when an upcoming reservation exists', async () => {
  reset()
  fixtures.reservationRow = { id: 'res-1' }
  const result = await checkModuleHasLiveData(db, scope, 'reservations')
  assert.equal(result.blocked, true)
})

test('ordering is blocked when a delivery URL is set', async () => {
  reset()
  fixtures.orderingLocationRow = { id: 'loc-1' }
  const result = await checkModuleHasLiveData(db, scope, 'ordering')
  assert.equal(result.blocked, true)
})

test('services is blocked when a published offering exists', async () => {
  reset()
  fixtures.offeringRow = { id: 'offering-1' }
  const result = await checkModuleHasLiveData(db, scope, 'services')
  assert.equal(result.blocked, true)
})

test('the reason names the location, not the site, when scoped to a location', async () => {
  reset()
  fixtures.menuItemRow = { id: 'menu-item-1' }
  const result = await checkModuleHasLiveData(db, { siteId: 'site-1', locationId: 'loc-1' }, 'menu')
  assert.equal(result.blocked, true)
  assert.match(result.reason ?? '', /location has/)
})
