import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const capturedQueries: Array<{ query: string; params: unknown[] }> = []
const capturedFirstQueries: Array<{ query: string; params: unknown[] }> = []

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM member_access_scope')) {
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

const { getGuestThreadSource, listGuestThreads } = await import('../../server/utils/guest-threads.ts')

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
