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
  if (query.includes('FROM business_locations')) {
    return { id: params[0], title: 'Selected Location' } as T
  }
  if (query.includes('FROM experiences')) {
    return { id: params[0], title: 'Class', location_id: 'loc-1' } as T
  }
  if (query.includes('FROM contact_submissions')) {
    return {
      organization_id: 'org-1',
      site_id: 'site-1',
      location_id: 'loc-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.test',
      guest_phone: null,
      created_at: '2026-07-23T00:00:00.000Z',
      operational_status: 'new',
      subject: 'Question',
      message: 'Hello',
      location_title: 'Main Room',
      experience_title: 'Class',
      submission_type: 'contact',
    } as T
  }
  return null
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll,
    queryFirst,
    execute: async () => ({ meta: { changes: 0 } }),
  },
})

const {
  getGuestThreadOperationSummary,
  getGuestThreadSource,
  listGuestThreads,
  resolveContactSubmissionAssignment,
} = await import('../../server/utils/guest-threads.ts')

test('location inbox filters to the exact assigned location without duplicating site-wide threads', async () => {
  capturedQueries.length = 0

  await listGuestThreads({} as never, 'site-1', { locationId: 'loc-1' })

  assert.equal(capturedQueries.length, 1)
  assert.match(capturedQueries[0]!.query, /gt\.location_id = \?/)
  assert.doesNotMatch(capturedQueries[0]!.query, /gt\.location_id = \? OR gt\.location_id IS NULL/)
  assert.deepEqual(capturedQueries[0]!.params.slice(0, 2), ['site-1', 'loc-1'])
})

test('site aggregate for a location-scoped editor includes only accessible assigned locations', async () => {
  capturedQueries.length = 0

  await listGuestThreads({} as never, 'site-1', {
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

test('contact thread source derives an assigned location from contact or experience data', async () => {
  capturedFirstQueries.length = 0

  const source = await getGuestThreadSource({} as never, 'contact', 'contact-1')

  assert.equal(source?.location_id, 'loc-1')
  assert.equal(source?.location_title, 'Main Room')
  assert.match(capturedFirstQueries[0]!.query, /COALESCE\(ct\.location_id, e\.location_id\) AS location_id/)
  assert.match(capturedFirstQueries[0]!.query, /LEFT JOIN business_locations bl ON bl\.id = COALESCE\(ct\.location_id, e\.location_id\)/)
  assert.deepEqual(capturedFirstQueries[0]!.params, ['contact-1'])
})

test('guest thread operation summary counts only non-closed reservation and booking work', async () => {
  capturedFirstQueries.length = 0

  const summary = await getGuestThreadOperationSummary({} as never, 'site-1', { locationId: 'loc-1' })

  assert.deepEqual(summary, { openThreads: 3, unreadThreads: 2, reservations: 1, experienceBookings: 1 })
  assert.match(capturedFirstQueries[0]!.query, /gt\.location_id = \?/)
  assert.match(capturedFirstQueries[0]!.query, /gt\.inbox_status != 'closed' AND gt\.submission_type = 'reservation'/)
  assert.match(capturedFirstQueries[0]!.query, /gt\.inbox_status != 'closed' AND gt\.submission_type = 'experience_booking'/)
  assert.deepEqual(capturedFirstQueries[0]!.params, ['site-1', 'loc-1'])
})

test('contact assignment utility gives experience location precedence over selected location', async () => {
  capturedFirstQueries.length = 0

  const assignment = await resolveContactSubmissionAssignment({} as never, {
    siteId: 'site-1',
    locationId: 'loc-selected',
    experienceId: 'contact-1',
  })

  assert.equal(assignment.error, null)
  assert.equal(assignment.assignedLocationId, 'loc-1')
  assert.equal(assignment.selectedLocation?.id, 'loc-selected')
  assert.equal(assignment.experience?.id, 'contact-1')
})
