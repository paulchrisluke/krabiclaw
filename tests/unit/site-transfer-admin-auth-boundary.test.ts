import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
let memberRole: string | null = 'owner'
let memberLookupError: Error | null = null
const queryLog: string[] = []
const cancellationCalls: string[] = []

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: fakeDb }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({ $context: Promise.resolve({}) }),
    getAuthSession: async () => ({ user: { id: 'platform-operator', email: 'operator@example.com' } }),
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => ({
      findMemberByOrgId: async () => {
        if (memberLookupError) throw memberLookupError
        return memberRole ? { userId: 'platform-operator', organizationId: 'org-source', role: memberRole } : null
      },
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      queryLog.push(query)
      if (query.includes('FROM sites')) return { id: 'site-source', organization_id: 'org-source' } as T
      if (query.includes('FROM site_transfer_requests')) return { id: 'transfer-source' } as T
      return null
    },
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    cancelPendingSiteTransfer: async (_env: unknown, _db: unknown, transferId: string) => {
      cancellationCalls.push(transferId)
      return { cancelled: true, customDomainsDeleted: 0 }
    },
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: { params?: Record<string, string> }, name: string) => event.params?.[name]

const { default: cancelHandler } = await import('../../server/api/admin/sites/[siteId]/transfer.delete.ts?admin-auth-boundary') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
})

test.beforeEach(() => {
  memberRole = 'owner'
  memberLookupError = null
  queryLog.length = 0
  cancellationCalls.length = 0
})

function invoke() {
  return cancelHandler({ params: { siteId: 'site-source' } })
}

test('a platform operator without exact tenant membership cannot cancel a transfer', async () => {
  memberRole = null

  const result = await invoke()

  assert.equal(result.status, 404)
  assert.match(String(result.body.error), /access denied/i)
  assert.deepEqual(cancellationCalls, [])
  assert.equal(queryLog.filter(query => query.includes('site_transfer_requests')).length, 0)
})

for (const role of ['owner', 'admin'] as const) {
  test(`an exact tenant ${role} membership may cancel a transfer`, async () => {
    memberRole = role

    const result = await invoke()

    assert.equal(result.status, 200)
    assert.deepEqual(cancellationCalls, ['transfer-source'])
  })
}

test('missing or malformed Better Auth membership fails closed', async () => {
  memberLookupError = new Error('adapter unavailable')

  const result = await invoke()

  assert.equal(result.status, 404)
  assert.deepEqual(cancellationCalls, [])
})
