import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveTransferRecipientOrganizationsFromUsers } from '../../server/utils/site-transfer-recipient.ts'

function createAdapter(input: {
  organizations?: Array<{ id: string; name: string; slug: string }>
  roles?: Record<string, string>
}) {
  const calls: string[] = []
  return {
    calls,
    adapter: {
      async listOrganizations(_userId: string) {
        return input.organizations ?? []
      },
      async findMemberByOrgId({ organizationId }: { userId: string; organizationId: string }) {
        calls.push(organizationId)
        return input.roles?.[organizationId] ? { role: input.roles[organizationId] } : null
      },
    },
  }
}

test('recipient resolution requires an exact email and returns only owned organizations in stable order', async () => {
  const { adapter, calls } = createAdapter({
    organizations: [
      { id: 'org-z', name: 'Zulu', slug: 'zulu' },
      { id: 'org-a', name: 'alpha', slug: 'alpha' },
      { id: 'org-member', name: 'Member only', slug: 'member-only' },
    ],
    roles: {
      'org-z': 'owner',
      'org-a': 'owner',
      'org-member': 'member',
    },
  })

  const result = await resolveTransferRecipientOrganizationsFromUsers({
    email: '  Recipient@Example.com ',
    users: [
      { id: 'user-1', email: 'recipient@example.com' },
      { id: 'user-near', email: 'recipient@example.com.attacker.test' },
    ],
    organizationAdapter: adapter,
  })

  assert.deepEqual(result, {
    email: 'recipient@example.com',
    status: 'ready',
    userId: 'user-1',
    organizations: [
      { id: 'org-a', name: 'alpha', slug: 'alpha' },
      { id: 'org-z', name: 'Zulu', slug: 'zulu' },
    ],
  })
  assert.deepEqual(calls, ['org-z', 'org-a', 'org-member'])
})

test('recipient resolution is missing when no exact account exists', async () => {
  const { adapter, calls } = createAdapter()
  const result = await resolveTransferRecipientOrganizationsFromUsers({
    email: 'recipient@example.com',
    users: [{ id: 'user-near', email: 'recipient@example.com.attacker.test' }],
    organizationAdapter: adapter,
  })

  assert.equal(result.status, 'missing')
  assert.equal(result.userId, null)
  assert.deepEqual(result.organizations, [])
  assert.deepEqual(calls, [])
})

test('recipient resolution refuses ambiguous exact accounts', async () => {
  const { adapter, calls } = createAdapter()
  const result = await resolveTransferRecipientOrganizationsFromUsers({
    email: 'recipient@example.com',
    users: [
      { id: 'user-1', email: 'recipient@example.com' },
      { id: 'user-2', email: 'Recipient@Example.com' },
    ],
    organizationAdapter: adapter,
  })

  assert.equal(result.status, 'ambiguous')
  assert.equal(result.userId, null)
  assert.deepEqual(result.organizations, [])
  assert.deepEqual(calls, [])
})

test('recipient resolution distinguishes an account with no owned organization', async () => {
  const { adapter } = createAdapter({
    organizations: [{ id: 'org-member', name: 'Member only', slug: 'member-only' }],
    roles: { 'org-member': 'member' },
  })

  const result = await resolveTransferRecipientOrganizationsFromUsers({
    email: 'recipient@example.com',
    users: [{ id: 'user-1', email: 'recipient@example.com' }],
    organizationAdapter: adapter,
  })

  assert.equal(result.status, 'no_owned_organization')
  assert.equal(result.userId, 'user-1')
  assert.deepEqual(result.organizations, [])
})

test('recipient resolution fails closed on malformed Better Auth organization data', async () => {
  const { adapter } = createAdapter({
    organizations: [{ id: '', name: 'Invalid', slug: 'invalid' }],
    roles: { '': 'owner' },
  })

  await assert.rejects(
    () => resolveTransferRecipientOrganizationsFromUsers({
      email: 'recipient@example.com',
      users: [{ id: 'user-1', email: 'recipient@example.com' }],
      organizationAdapter: adapter,
    }),
    /invalid recipient organization id/,
  )
})

test('recipient resolution fails closed on an exact account with no valid user ID', async () => {
  const { adapter } = createAdapter()

  await assert.rejects(
    () => resolveTransferRecipientOrganizationsFromUsers({
      email: 'recipient@example.com',
      users: [{ id: '', email: 'recipient@example.com' }],
      organizationAdapter: adapter,
    }),
    /invalid transfer recipient user ID/,
  )
})
