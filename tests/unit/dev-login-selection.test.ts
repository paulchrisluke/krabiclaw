import test from 'node:test'
import assert from 'node:assert/strict'

import { selectDevLoginUser } from '../../server/utils/dev-login-selection.ts'

test('dev login paginates until it finds a site user after the first page', async () => {
  const candidates = Array.from({ length: 51 }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example.test`,
  }))
  const calls: Array<{ limit?: number; offset?: number }> = []

  const selected = await selectDevLoginUser({
    internalAdapter: {
      listUsers: async (limit, offset) => {
        calls.push({ limit, offset })
        return candidates.slice(offset ?? 0, (offset ?? 0) + (limit ?? candidates.length))
      },
    },
    organizationAdapter: {
      listOrganizations: async (userId) => userId === 'user-50' ? [{ id: 'org-with-site' }] : [],
      findMemberByOrgId: async () => null,
    },
    hasSite: async (organizationIds) => organizationIds.includes('org-with-site'),
  })

  assert.equal(selected?.id, 'user-50')
  assert.deepEqual(calls, [
    { limit: 50, offset: 0 },
    { limit: 50, offset: 50 },
  ])
})
