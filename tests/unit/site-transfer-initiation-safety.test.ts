import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
const pendingRows: Array<{ id: string; to_email: string; custom_domains_removed_at: string | null }> = []
const cleanupCalls: string[] = []
const batchCalls: Array<Array<{ query: string; params?: unknown[] }>> = []
let cleanupError: Error | null = null
let cleanupResult: { cancelled: boolean; customDomainsDeleted: number; reason?: 'payment_completed' } = { cancelled: true, customDomainsDeleted: 1 }
let batchError: Error | null = null
let memberRole: string | null = 'owner'
let memberLookupError: Error | null = null
let remainingMarker: { status: string; custom_domains_removed_at: string | null } | null = {
  status: 'cancelled',
  custom_domains_removed_at: null,
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: fakeDb, NUXT_PUBLIC_PLATFORM_DOMAIN: 'krabiclaw.com' }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({ $context: Promise.resolve({}) }),
    getAuthSession: async () => ({ user: { id: 'user-owner', email: 'owner@example.com', name: 'Owner' } }),
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => ({
      findMemberByOrgId: async () => {
        if (memberLookupError) throw memberLookupError
        return memberRole ? { userId: 'user-owner', organizationId: 'org-source', role: memberRole } : null
      },
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('FROM sites')) {
        return { id: 'site-source', organization_id: 'org-source', brand_name: 'Source Site' } as T
      }
      if (query.includes('SELECT status, custom_domains_removed_at')) return remainingMarker as T | null
      return null
    },
    queryAll: async <T>(_db: unknown, query: string): Promise<T[]> => {
      if (query.includes('FROM site_transfer_requests')) return pendingRows as T[]
      return []
    },
    executeBatch: async (_db: unknown, batch: Array<{ query: string; params?: unknown[] }>) => {
      if (batchError) throw batchError
      batchCalls.push(batch)
      return batch.map(() => ({ meta: { changes: 1 } }))
    },
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    buildTransferDomainSnapshot: async () => [],
    cancelPendingSiteTransfer: async (_env: unknown, _db: unknown, transferId: string) => {
      cleanupCalls.push(transferId)
      if (cleanupError) throw cleanupError
      return cleanupResult
    },
    serializeTransferDomainSnapshot: (snapshot: unknown) => JSON.stringify(snapshot),
  },
})

mock.module('vue-email', {
  namedExports: {
    useRender: async () => ({ html: '<html />', text: 'handoff' }),
    EHtml: {},
    EHead: {},
    EBody: {},
    EPreview: {},
    EContainer: {},
    ESection: {},
    EText: {},
    EHeading: {},
    EButton: {},
    ELink: {},
    EImg: {},
    EStyle: {},
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
  readBody: globalThis.readBody,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: { params?: Record<string, string> }, name: string) => event.params?.[name]
globalThis.readBody = async () => ({ email: 'recipient@example.com', plan: 'growth' })

const { default: handler } = await import('../../server/api/admin/sites/[siteId]/transfer.post.ts?initiation-safety') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
  globalThis.readBody = previousGlobals.readBody
})

test.beforeEach(() => {
  pendingRows.length = 0
  cleanupCalls.length = 0
  batchCalls.length = 0
  cleanupError = null
  cleanupResult = { cancelled: true, customDomainsDeleted: 1 }
  batchError = null
  memberRole = 'owner'
  memberLookupError = null
  remainingMarker = { status: 'cancelled', custom_domains_removed_at: null }
})

function invoke() {
  return handler({ params: { siteId: 'site-source' } })
}

test('platform control-plane access without exact tenant membership is rejected', async () => {
  memberRole = null

  const result = await invoke()

  assert.equal(result.status, 404)
  assert.match(String(result.body.error), /access denied/i)
  assert.equal(batchCalls.length, 0)
})

test('an exact tenant admin membership may initiate a transfer', async () => {
  memberRole = 'admin'

  const result = await invoke()

  assert.equal(result.status, 200)
  assert.equal(batchCalls.length, 1)
})

test('malformed Better Auth membership fails closed', async () => {
  memberRole = 'editor'

  const result = await invoke()

  assert.equal(result.status, 404)
  assert.equal(batchCalls.length, 0)
})

test('replacement cleans a legacy paused-domain transfer before inserting the new request', async () => {
  pendingRows.push({
    id: 'legacy-transfer',
    to_email: 'previous@example.net',
    custom_domains_removed_at: '2026-07-15T00:00:00.000Z',
  })

  const result = await invoke()

  assert.equal(result.status, 200)
  assert.deepEqual(cleanupCalls, ['legacy-transfer'])
  assert.equal(batchCalls.length, 1)
  const batch = batchCalls[0]!
  assert.equal(batch.length, 2)
  assert.ok(batch[0]?.query.includes("WHERE site_id = ? AND status = 'pending'"))
  assert.ok(batch[0]?.query.includes('json(?)'))
  assert.ok(batch.some(statement => statement.query.includes('INSERT INTO site_transfer_requests')))
})

test('replacement cancels every prior pending transfer before inserting the new request', async () => {
  pendingRows.push(
    {
      id: 'open-checkout-transfer',
      to_email: 'previous@example.net',
      custom_domains_removed_at: null,
    },
    {
      id: 'free-transfer',
      to_email: 'another@example.net',
      custom_domains_removed_at: null,
    },
  )

  const result = await invoke()

  assert.equal(result.status, 200)
  assert.deepEqual(cleanupCalls, ['open-checkout-transfer', 'free-transfer'])
  assert.ok(batchCalls[0]?.some(statement => statement.query.includes('INSERT INTO site_transfer_requests')))
})

test('replacement preserves the identical-recipient conflict without cancelling the existing request', async () => {
  pendingRows.push({
    id: 'existing-transfer',
    to_email: 'RECIPIENT@example.com',
    custom_domains_removed_at: null,
  })

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /already exists/i)
  assert.deepEqual(cleanupCalls, [])
  assert.equal(batchCalls.length, 0)
})

test('replacement fails closed when a prior non-marker transfer cannot be cancelled', async () => {
  pendingRows.push({
    id: 'paid-transfer',
    to_email: 'previous@example.net',
    custom_domains_removed_at: null,
  })
  cleanupResult = { cancelled: false, customDomainsDeleted: 0, reason: 'payment_completed' }

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /safely cancelled/i)
  assert.deepEqual(cleanupCalls, ['paid-transfer'])
  assert.equal(batchCalls.length, 0)
})

test('replacement fails closed when legacy paused-domain cleanup cannot complete', async () => {
  pendingRows.push({
    id: 'legacy-transfer',
    to_email: 'previous@example.net',
    custom_domains_removed_at: '2026-07-15T00:00:00.000Z',
  })
  cleanupError = new Error('Cloudflare unavailable')

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /cleanup/i)
  assert.deepEqual(cleanupCalls, ['legacy-transfer'])
  assert.equal(batchCalls.length, 0)
})

test('replacement fails closed if the cleanup saga loses its pending-state race', async () => {
  pendingRows.push({
    id: 'legacy-transfer',
    to_email: 'previous@example.net',
    custom_domains_removed_at: '2026-07-15T00:00:00.000Z',
  })
  cleanupResult = { cancelled: false, customDomainsDeleted: 0 }

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /changed/i)
  assert.equal(batchCalls.length, 0)
})

test('replacement fails closed if a concurrent legacy marker appears during the insert batch', async () => {
  batchError = new Error('malformed JSON')

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /cleanup/i)
  assert.equal(batchCalls.length, 0)
})
