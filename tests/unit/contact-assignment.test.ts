import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  if (query.includes('FROM business_locations')) {
    if (params[0] === 'bad-location') return null
    return { id: params[0], title: 'Selected Location' } as T
  }
  if (query.includes('FROM experiences')) {
    return { id: params[0], title: 'Class', location_id: 'loc-1' } as T
  }
  return null
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst },
})

const { resolveContactSubmissionAssignment } = await import('../../server/utils/contact-assignment.ts')

const db = {} as D1Database

test('contact assignment utility gives experience location precedence over selected location', async () => {
  const assignment = await resolveContactSubmissionAssignment(db, {
    siteId: 'site-1',
    locationId: 'loc-selected',
    experienceId: 'contact-1',
  })

  assert.equal(assignment.error, null)
  assert.equal(assignment.assignedLocationId, 'loc-1')
  assert.equal(assignment.selectedLocation?.id, 'loc-selected')
  assert.equal(assignment.experience?.id, 'contact-1')
})

test('an invalid location id returns a deterministic error instead of a partial assignment', async () => {
  const assignment = await resolveContactSubmissionAssignment(db, {
    siteId: 'site-1',
    locationId: 'bad-location',
  })
  assert.ok(assignment.error)
  assert.equal(assignment.assignedLocationId, null)
})

test('no location or experience provided resolves to no assignment, without error', async () => {
  const assignment = await resolveContactSubmissionAssignment(db, { siteId: 'site-1' })
  assert.equal(assignment.error, null)
  assert.equal(assignment.assignedLocationId, null)
})
