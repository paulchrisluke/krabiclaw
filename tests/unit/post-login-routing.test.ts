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

const { isImpersonationSession, resolvePostLoginDestination } = await import('../../server/utils/post-login-routing.ts')

const db = {} as D1Database

test.beforeEach(() => {
  membershipSlug = null
  linkedCustomerUserIds = new Set<string>()
})

test('post-login sends non-impersonated platform admins to admin when there is no explicit redirect', async () => {
  const destination = await resolvePostLoginDestination(db, { id: 'admin-1' }, {}, { isPlatformAdmin: true })
  assert.equal(destination, '/admin')
})

test('post-login preserves impersonation context before applying platform admin routing', async () => {
  membershipSlug = 'client-org'
  const destination = await resolvePostLoginDestination(
    db,
    { id: 'admin-shaped-target' },
    { impersonatedBy: 'platform-admin-1' },
    { isPlatformAdmin: true },
  )
  assert.equal(destination, '/dashboard/client-org')
})

test('post-login sends organization members to their canonical dashboard', async () => {
  membershipSlug = 'pottery-house-krabi'
  const destination = await resolvePostLoginDestination(db, { id: 'owner-1' }, {}, { isPlatformAdmin: false })
  assert.equal(destination, '/dashboard/pottery-house-krabi')
})

test('post-login distinguishes guest accounts from new users', async () => {
  linkedCustomerUserIds.add('guest-1')
  assert.equal(await resolvePostLoginDestination(db, { id: 'guest-1' }, {}, { isPlatformAdmin: false }), '/account')
  assert.equal(await resolvePostLoginDestination(db, { id: 'new-1' }, {}, { isPlatformAdmin: false }), '/dashboard/onboarding')
})

test('impersonation sessions require a Better Auth impersonatedBy marker', () => {
  assert.equal(isImpersonationSession({ impersonatedBy: 'admin-1' }), true)
  assert.equal(isImpersonationSession({ impersonatedBy: ' ' }), false)
  assert.equal(isImpersonationSession({}), false)
})
