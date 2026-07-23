import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addPlatformAdminUser,
  countPlatformUsers,
  listPlatformAdminUsers,
  listPlatformUsers,
  requirePlatformUserPermission,
} from '../../server/utils/platform-admin-users.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    role: 'user',
    banned: false,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  }
}

function makeAdminApi(users: Array<ReturnType<typeof makeUser>>) {
  const calls: Array<{ method: string; input: unknown }> = []
  return {
    calls,
    api: {
      async listUsers(input: { query?: Record<string, unknown> }) {
        calls.push({ method: 'listUsers', input })
        const query = input.query ?? {}
        let results = [...users]

        if (query.searchValue) {
          const needle = String(query.searchValue).toLowerCase()
          results = results.filter(user => user.email.toLowerCase().includes(needle))
        }

        if (query.filterField === 'role' && query.filterOperator === 'contains') {
          const needle = String(query.filterValue)
          results = results.filter(user => String(user.role ?? '').includes(needle))
        }

        return { users: results, total: results.length }
      },
      async setRole(input: unknown) {
        calls.push({ method: 'setRole', input })
        return { user: makeUser({ role: 'admin' }) }
      },
      async createUser(input: unknown) {
        calls.push({ method: 'createUser', input })
        return { user: makeUser({ email: 'new-admin@example.com', role: 'admin' }) }
      },
      async userHasPermission(input: unknown) {
        calls.push({ method: 'userHasPermission', input })
        return { success: true }
      },
    },
  }
}

test('listPlatformUsers delegates search, pagination, and sorting to Better Auth Admin listUsers', async () => {
  const fake = makeAdminApi([makeUser()])
  const result = await listPlatformUsers(fake.api as never, {}, { search: 'ada', limit: 25, offset: 50 })

  assert.equal(result.total, 1)
  assert.equal(result.users[0]?.createdAt, '2026-07-23T00:00:00.000Z')
  assert.deepEqual(fake.calls[0], {
    method: 'listUsers',
    input: {
      query: {
        searchValue: 'ada',
        searchField: 'email',
        searchOperator: 'contains',
        limit: 25,
        offset: 50,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
      headers: {},
    },
  })
})

test('listPlatformAdminUsers reads admins through Better Auth Admin listUsers', async () => {
  const fake = makeAdminApi([
    makeUser({ id: 'admin-1', role: 'admin' }),
    makeUser({ id: 'multi-role-admin', role: 'user,admin' }),
  ])
  const result = await listPlatformAdminUsers(fake.api as never, {})

  assert.deepEqual(result.map(user => user.id), ['admin-1', 'multi-role-admin'])
  assert.equal((fake.calls[0]?.input as { query: Record<string, unknown> }).query.filterField, 'role')
  assert.equal((fake.calls[0]?.input as { query: Record<string, unknown> }).query.filterOperator, 'contains')
})

test('countPlatformUsers uses Better Auth Admin pagination metadata', async () => {
  const fake = makeAdminApi([makeUser()])
  const total = await countPlatformUsers(fake.api as never, {})

  assert.equal(total, 1)
  assert.equal((fake.calls[0]?.input as { query: Record<string, unknown> }).query.limit, 1)
})

test('addPlatformAdminUser promotes an existing user through Better Auth setRole', async () => {
  const fake = makeAdminApi([makeUser({ id: 'existing-user', email: 'person@example.com', role: 'user' })])
  const result = await addPlatformAdminUser(fake.api as never, {}, { email: 'Person@Example.com' })

  assert.deepEqual(result, { action: 'promoted', email: 'person@example.com' })
  assert.deepEqual(fake.calls.map(call => call.method), ['listUsers', 'setRole'])
  assert.deepEqual(fake.calls[1]?.input, {
    body: { userId: 'existing-user', role: 'admin' },
    headers: {},
  })
})

test('addPlatformAdminUser creates a new admin through Better Auth createUser', async () => {
  const fake = makeAdminApi([])
  const result = await addPlatformAdminUser(fake.api as never, {}, { email: 'new-admin@example.com' })

  assert.deepEqual(result, { action: 'created', email: 'new-admin@example.com' })
  assert.deepEqual(fake.calls.map(call => call.method), ['listUsers', 'createUser'])
  assert.deepEqual(fake.calls[1]?.input, {
    body: {
      email: 'new-admin@example.com',
      name: 'new-admin',
      role: 'admin',
    },
    headers: {},
  })
})

test('requirePlatformUserPermission uses Better Auth Admin has-permission', async () => {
  const fake = makeAdminApi([])
  await requirePlatformUserPermission(fake.api as never, {}, 'set-role')

  assert.deepEqual(fake.calls[0], {
    method: 'userHasPermission',
    input: {
      body: { permissions: { user: ['set-role'] } },
      headers: {},
    },
  })
})

test('migrated admin user/session routes do not query Better Auth user or session tables directly', () => {
  for (const path of [
    'server/api/admin/analytics.get.ts',
    'server/api/admin/invite/team.post.ts',
    'server/api/admin/members.get.ts',
    'server/api/admin/users.get.ts',
  ]) {
    assert.doesNotMatch(
      source(path),
      /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:user|session)\b/i,
      `${path} should use Better Auth Admin APIs for user/session administration`,
    )
  }
})
