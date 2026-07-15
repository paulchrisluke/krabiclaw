import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

interface Call {
  query: string
  params: unknown[]
}

const calls: Call[] = []

const ORGS = [
  { id: 'org-pottery', name: 'Pottery House Krabi', slug: 'pottery-house', has_owner: 0, has_pending_invitation: 0 },
  { id: 'org-kikuzuki', name: 'Kikuzuki Krabi', slug: 'kikuzuki-krabi', has_owner: 1, has_pending_invitation: 0 },
  { id: 'org-blawby', name: 'Blawby', slug: 'blawby', has_owner: 1, has_pending_invitation: 0 },
  // Provisioned by client:import --apply, then an invite was already sent but not yet
  // accepted: no owner member exists, but a pending invitation does. Regression coverage
  // for the case where the old hasOwner-only check let the picker show this as "safe" and
  // the admin would only discover the conflict after submitting (invite/client.post.ts's
  // second 409, "Organization already has a pending owner invitation").
  { id: 'org-pending', name: 'Pending Invite Co', slug: 'pending-invite-co', has_owner: 0, has_pending_invitation: 1 },
]

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  calls.push({ query, params })

  if (query.includes('WHERE o.slug LIKE')) {
    const needle = String(params[0]).replace(/^%|%$/g, '').toLowerCase()
    return ORGS.filter(org =>
      org.slug.toLowerCase().includes(needle) || org.name.toLowerCase().includes(needle),
    ) as T[]
  }

  // No WHERE clause: "browse most recent" path.
  return ORGS as T[]
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll },
})

const { searchOrganizationsForInvite } = await import('../../server/utils/admin-org-search.ts')

test('searchOrganizationsForInvite matches by slug', async () => {
  const results = await searchOrganizationsForInvite({} as never, 'pottery-house')
  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, 'org-pottery')
  assert.equal(results[0]?.hasOwner, false)
})

test('searchOrganizationsForInvite matches by name', async () => {
  const results = await searchOrganizationsForInvite({} as never, 'Kikuzuki')
  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, 'org-kikuzuki')
  assert.equal(results[0]?.hasOwner, true)
})

test('searchOrganizationsForInvite reports hasOwner so the UI can warn before a 409', async () => {
  const results = await searchOrganizationsForInvite({} as never, '')
  const owned = results.find(org => org.id === 'org-blawby')
  const unowned = results.find(org => org.id === 'org-pottery')
  assert.equal(owned?.hasOwner, true)
  assert.equal(unowned?.hasOwner, false)
})

test('searchOrganizationsForInvite reports hasPendingInvitation for orgs with no owner member but a pending owner invite', async () => {
  const results = await searchOrganizationsForInvite({} as never, '')
  const pending = results.find(org => org.id === 'org-pending')
  assert.equal(pending?.hasOwner, false)
  assert.equal(pending?.hasPendingInvitation, true)

  // Sanity check the other fixtures don't false-positive on the new field.
  const owned = results.find(org => org.id === 'org-blawby')
  const clean = results.find(org => org.id === 'org-pottery')
  assert.equal(owned?.hasPendingInvitation, false)
  assert.equal(clean?.hasPendingInvitation, false)
})

test('searchOrganizationsForInvite trims the query and falls back to the browse-recent path for blank input', async () => {
  const results = await searchOrganizationsForInvite({} as never, '   ')
  assert.equal(results.length, ORGS.length)
})

test('searchOrganizationsForInvite escapes LIKE metacharacters in the query', async () => {
  calls.length = 0
  await searchOrganizationsForInvite({} as never, '100%_off')
  const call = calls.at(-1)
  assert.ok(call)
  assert.equal(call?.params[0], '%100\\%\\_off%')
  assert.equal(call?.params[1], '%100\\%\\_off%')
})
