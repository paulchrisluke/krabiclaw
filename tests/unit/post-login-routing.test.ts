import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let membershipSlug: string | null = null
let linkedCustomerUserIds = new Set<string>()

async function queryFirst<T>(): Promise<T | undefined> {
  return membershipSlug ? { slug: membershipSlug } as T : undefined
}

async function userHasLinkedCustomers(_db: unknown, userId: string): Promise<boolean> {
  return linkedCustomerUserIds.has(userId)
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryFirst },
})

mock.module('../../server/utils/guest-claims.ts', {
  namedExports: { userHasLinkedCustomers },
})

const { resolvePostLoginDestination } = await import('../../server/utils/post-login-routing.ts')

const db = {} as D1Database

test.beforeEach(() => {
  membershipSlug = null
  linkedCustomerUserIds = new Set<string>()
})

test('post-login sends organization members to their canonical dashboard', async () => {
  membershipSlug = 'pottery-house-krabi'
  const destination = await resolvePostLoginDestination(db, { id: 'owner-1' })
  assert.equal(destination, '/dashboard/pottery-house-krabi')
})

test('post-login sends platform admins with an organization to its dashboard', async () => {
  membershipSlug = 'pottery-house-krabi'
  const destination = await resolvePostLoginDestination(db, { id: 'admin-1', role: 'admin' })
  assert.equal(destination, '/dashboard/pottery-house-krabi')
})

test('post-login distinguishes guest accounts from new users', async () => {
  linkedCustomerUserIds.add('guest-1')
  assert.equal(await resolvePostLoginDestination(db, { id: 'guest-1' }), '/account')
  assert.equal(await resolvePostLoginDestination(db, { id: 'new-1' }), '/dashboard/onboarding')
})
