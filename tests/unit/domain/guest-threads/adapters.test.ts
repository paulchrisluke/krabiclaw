import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const state = {
  reservationRows: new Map<string, Record<string, unknown>>(),
  bookingRows: new Map<string, Record<string, unknown>>(),
  contactRows: new Map<string, Record<string, unknown>>(),
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  const id = params[0] as string
  if (query.includes('FROM contact_submissions')) return (clone(state.contactRows.get(id)) ?? null) as T | null
  if (query.includes('FROM reservation_submissions')) return (clone(state.reservationRows.get(id)) ?? null) as T | null
  if (query.includes('FROM experience_bookings')) return (clone(state.bookingRows.get(id)) ?? null) as T | null
  return null
}

function clone<T>(value: T): T {
  return value ? { ...value } : value
}

async function execute(_db: unknown, query: string, params: unknown[] = []) {
  if (query.includes('UPDATE reservation_submissions')) {
    const [status] = params as [string]
    const id = params[params.length - 2] as string
    const row = state.reservationRows.get(id)
    if (row) row.status = status
    return { meta: { changes: row ? 1 : 0 } }
  }
  if (query.includes('UPDATE experience_bookings')) {
    const [status, , siteId, id] = params as [string, string, string, string]
    const row = state.bookingRows.get(id)
    if (row && row.site_id === siteId) {
      row.status = status
      return { meta: { changes: 1 } }
    }
    return { meta: { changes: 0 } }
  }
  return { meta: { changes: 0 } }
}

async function queryAll<T>(): Promise<T[]> {
  return []
}

const realDb = await import('../../../../server/db/index.ts')

mock.module('../../../../server/db/index.ts', {
  namedExports: { ...realDb, execute, queryAll, queryFirst },
})

const { contactAdapter } = await import('../../../../server/domain/guest-threads/adapters/contact.ts')
const { reservationAdapter } = await import('../../../../server/domain/guest-threads/adapters/reservation.ts')
const { experienceBookingAdapter } = await import('../../../../server/domain/guest-threads/adapters/experience-booking.ts')
const { getAdapter } = await import('../../../../server/domain/guest-threads/adapters/registry.ts')

const db = {} as D1Database
const ctx = { db, actorUserId: 'user-1', actorMemberId: 'member-1' }

function reset() {
  state.reservationRows = new Map()
  state.bookingRows = new Map()
  state.contactRows = new Map()
}

test('contact adapter never exposes operational actions and rejects any execution', async () => {
  reset()
  state.contactRows.set('c1', {
    id: 'c1', organization_id: 'org1', site_id: 'site1', location_id: null,
    name: 'Guest', email: 'guest@example.com', subject: 'Hi', message: 'Question',
    status: 'new', created_at: '2026-01-01T00:00:00.000Z', location_title: null, experience_title: null,
  })
  const source = await contactAdapter.loadSource({ db }, 'c1')
  assert.ok(source)
  assert.deepEqual(contactAdapter.listAvailableActions(source), [])
  const result = await contactAdapter.executeAction(ctx, source, 'anything' as never)
  assert.equal(result.ok, false)

  const snapshot = contactAdapter.createOpeningSnapshot(source)
  assert.equal(snapshot.guestName, 'Guest')
  assert.equal(snapshot.message, 'Question')
})

test('reservation adapter transition matrix matches the locked table exactly', () => {
  const base = { id: 'r1', organization_id: 'o', site_id: 's', location_id: null, name: 'G', email: 'g@e.com', phone: null, date: '2026-07-19', time: '17:30', guests: '4', requests: null, created_at: 'x', location_title: null }
  assert.deepEqual(reservationAdapter.listAvailableActions({ ...base, status: 'new' }), ['confirm', 'cancel'])
  assert.deepEqual(reservationAdapter.listAvailableActions({ ...base, status: 'confirmed' }), ['complete', 'cancel'])
  assert.deepEqual(reservationAdapter.listAvailableActions({ ...base, status: 'completed' }), [])
  assert.deepEqual(reservationAdapter.listAvailableActions({ ...base, status: 'cancelled' }), [])
})

test('reservation adapter rejects an action not valid for the current status (stale/repeated transition)', async () => {
  reset()
  state.reservationRows.set('r1', {
    id: 'r1', organization_id: 'o', site_id: 's1', location_id: null, name: 'G', email: 'g@e.com',
    phone: null, date: '2026-07-19', time: '17:30', guests: '4', requests: null, status: 'cancelled',
    created_at: 'x', location_title: null,
  })
  const source = await reservationAdapter.loadSource({ db }, 'r1')
  assert.ok(source)
  const result = await reservationAdapter.executeAction(ctx, source, 'confirm')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, 'invalid_transition')
})

test('reservation adapter confirm mutates status and reports notification requirement', async () => {
  reset()
  state.reservationRows.set('r1', {
    id: 'r1', organization_id: 'o', site_id: 's1', location_id: null, name: 'G', email: 'g@e.com',
    phone: null, date: '2026-07-19', time: '17:30', guests: '4', requests: null, status: 'new',
    created_at: 'x', location_title: null,
  })
  const source = await reservationAdapter.loadSource({ db }, 'r1')
  assert.ok(source)
  const result = await reservationAdapter.executeAction(ctx, source, 'confirm')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.beforeStatus, 'new')
    assert.equal(result.afterStatus, 'confirmed')
    assert.equal(result.requiresNotification, true)
  }
  assert.equal(state.reservationRows.get('r1')?.status, 'confirmed')
})

test('experience booking adapter has no complete action anywhere in its transition matrix', () => {
  const base = { id: 'b1', organization_id: 'o', site_id: 's', location_id: null, guest_name: 'G', guest_email: 'g@e.com', guest_phone: null, booking_date: '2026-07-19', time_slot: '17:30', party_size: 2, notes: null, created_at: 'x', location_title: null, experience_title: null }
  for (const status of ['pending', 'confirmed', 'completed', 'cancelled']) {
    const actions = experienceBookingAdapter.listAvailableActions({ ...base, status })
    assert.ok(!actions.includes('complete' as never))
  }
  assert.deepEqual(experienceBookingAdapter.listAvailableActions({ ...base, status: 'completed' }), [])
  assert.deepEqual(experienceBookingAdapter.listAvailableActions({ ...base, status: 'cancelled' }), [])
})

test('experience booking adapter cancel mutates status', async () => {
  reset()
  state.bookingRows.set('b1', {
    id: 'b1', organization_id: 'o', site_id: 's1', location_id: null, guest_name: 'G', guest_email: 'g@e.com',
    guest_phone: null, booking_date: '2026-07-19', time_slot: '17:30', party_size: 2, notes: null, status: 'confirmed',
    created_at: 'x', location_title: null, experience_title: null,
  })
  const source = await experienceBookingAdapter.loadSource({ db }, 'b1')
  assert.ok(source)
  const result = await experienceBookingAdapter.executeAction(ctx, source, 'cancel')
  assert.equal(result.ok, true)
  assert.equal(state.bookingRows.get('b1')?.status, 'cancelled')
})

test('registry resolves the correct adapter per submission type', () => {
  assert.equal(getAdapter('contact').type, 'contact')
  assert.equal(getAdapter('reservation').type, 'reservation')
  assert.equal(getAdapter('experience_booking').type, 'experience_booking')
})
