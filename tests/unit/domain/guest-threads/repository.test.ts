import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const capturedQueries: Array<{ query: string; params: unknown[] }> = []
const capturedFirstQueries: Array<{ query: string; params: unknown[] }> = []

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('SELECT bl.id AS location_id')) {
    return [{ location_id: 'loc-1' }] as T[]
  }
  if (query.includes('FROM guest_threads')) {
    capturedQueries.push({ query, params })
    return [] as T[]
  }
  if (query.includes('FROM guest_thread_entries WHERE thread_id = ? LIMIT 1')) {
    return [] as T[]
  }
  throw new Error(`Unexpected queryAll query: ${query}`)
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  capturedFirstQueries.push({ query, params })
  if (query.includes('FROM guest_threads')) {
    return {
      openThreads: 3,
      unreadThreads: 2,
      reservations: 1,
      experienceBookings: 1,
    } as T
  }
  if (query.includes('FROM guest_thread_member_state')) return null
  if (query.includes('SELECT id FROM guest_thread_entries WHERE thread_id = ? LIMIT 1')) return null
  return null
}

mock.module('../../../../server/db/index.ts', {
  namedExports: {
    queryAll,
    queryFirst,
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => [],
  },
})

const { listGuestThreads, getGuestThreadOperationSummary } = await import('../../../../server/domain/guest-threads/repository.ts')

const db = {} as D1Database

test('location inbox filters to the exact assigned location without duplicating site-wide threads', async () => {
  capturedQueries.length = 0

  await listGuestThreads(db, 'site-1', { locationId: 'loc-1', memberId: 'member-1' })

  assert.equal(capturedQueries.length, 1)
  assert.match(capturedQueries[0]!.query, /gt\.location_id = \?/)
  assert.doesNotMatch(capturedQueries[0]!.query, /gt\.location_id = \? OR gt\.location_id IS NULL/)
  assert.deepEqual(capturedQueries[0]!.params.slice(0, 2), ['site-1', 'loc-1'])
})

test('site aggregate for a location-scoped editor includes only accessible assigned locations', async () => {
  capturedQueries.length = 0

  await listGuestThreads(db, 'site-1', {
    memberId: 'member-location',
    principal: {
      memberId: 'member-location',
      role: 'editor',
      organizationId: 'org-1',
      siteId: 'site-1',
    },
  })

  assert.equal(capturedQueries.length, 1)
  assert.match(capturedQueries[0]!.query, /gt\.location_id IN \(\?\)/)
  assert.doesNotMatch(capturedQueries[0]!.query, /gt\.location_id IS NULL/)
  assert.deepEqual(capturedQueries[0]!.params.slice(0, 2), ['site-1', 'loc-1'])
})

test('guest thread operation summary counts only non-resolved reservation and booking work', async () => {
  capturedFirstQueries.length = 0

  const summary = await getGuestThreadOperationSummary(db, 'site-1', { locationId: 'loc-1', memberId: '' })

  assert.deepEqual(summary, { openThreads: 3, unreadThreads: 0, reservations: 1, experienceBookings: 1 })
  assert.match(capturedFirstQueries[0]!.query, /gt\.location_id = \?/)
  assert.match(capturedFirstQueries[0]!.query, /gt\.conversation_state != 'resolved' AND gt\.submission_type = 'reservation'/)
  assert.match(capturedFirstQueries[0]!.query, /gt\.conversation_state != 'resolved' AND gt\.submission_type = 'experience_booking'/)
})
