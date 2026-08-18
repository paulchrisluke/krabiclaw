import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let membershipSlug: string | null = null

async function queryFirst<T>(): Promise<T | undefined> {
  return membershipSlug ? { slug: membershipSlug } as T : undefined
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst },
})

const { resolvePostLoginDestination } = await import('../../server/utils/post-login-routing.ts')

const db = {} as D1Database

test.beforeEach(() => {
  membershipSlug = null
})

test('post-login sends organization members to their canonical dashboard', async () => {
  membershipSlug = 'pottery-house-krabi'
  const destination = await resolvePostLoginDestination(db, { id: 'owner-1' })
  assert.equal(destination, '/dashboard/pottery-house-krabi')
})

test('post-login sends platform admins to the admin console', async () => {
  membershipSlug = 'pottery-house-krabi'
  const destination = await resolvePostLoginDestination(db, { id: 'admin-1', role: 'admin' })
  assert.equal(destination, '/admin')
})

test('post-login sends new users without an org to onboarding', async () => {
  assert.equal(await resolvePostLoginDestination(db, { id: 'new-1' }), '/dashboard/onboarding')
})
