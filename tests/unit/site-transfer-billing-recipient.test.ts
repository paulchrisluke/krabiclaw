import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
const resolverCalls: string[] = []

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: fakeDb }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/platform-admin-users.ts', {
  namedExports: {
    platformPermissionJsonResponse: async () => null,
  },
})

mock.module('../../server/utils/site-transfer-recipient.ts', {
  namedExports: {
    resolveTransferRecipientOrganizationsForEvent: async (_event: unknown, _env: unknown, email: string) => {
      resolverCalls.push(email)
      return {
        email,
        status: 'ready',
        userId: 'recipient-user',
        organizations: [
          { id: 'org-recipient-a', name: 'Recipient A', slug: 'recipient-a' },
          { id: 'org-recipient-b', name: 'Recipient B', slug: 'recipient-b' },
        ],
      }
    },
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({ $context: Promise.resolve({}) }),
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => ({
      findOrganizationById: async () => ({
        id: 'org-source',
        name: 'Source Organization',
        slug: 'source-organization',
      }),
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async <T>(_db: unknown, query: string): Promise<T[]> => {
      assert.doesNotMatch(query, /FROM\s+(?:user|organization)(?:\s|$)|JOIN\s+member(?:\s|$)/i)
      return []
    },
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | undefined> => {
      assert.doesNotMatch(query, /FROM\s+(?:user|organization)(?:\s|$)|JOIN\s+member(?:\s|$)/i)
      if (query.includes('FROM organization_billing')) {
        return {
          stripe_customer_id: 'cus_source',
          stripe_subscription_id: 'sub_source',
          plan: 'growth',
          status: 'active',
          current_period_end: '2026-09-08T00:00:00.000Z',
          cancel_at_period_end: 0,
        } as T
      }
      if (query.includes('FROM site_transfer_requests')) {
        return {
          id: 'transfer-1',
          site_id: 'site-source',
          to_email: 'recipient@example.com',
          invited_plan: 'growth',
          invited_interval: 'month',
          invited_domain: null,
          requires_payment: 1,
          created_at: '2026-08-08T00:00:00.000Z',
          brand_name: 'Source Site',
        } as T
      }
      throw new Error(`Unexpected queryFirst: ${query}`)
    },
  },
})

const previousDefineEventHandler = globalThis.defineEventHandler
const previousGetRouterParam = globalThis.getRouterParam
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: { params?: Record<string, string> }, name: string) => (
  name === 'orgId' ? event.params?.[name] : undefined
)

const { default: handler } = await import('../../server/api/admin/organizations/[orgId]/billing.get.ts?recipient-shape') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousDefineEventHandler
  globalThis.getRouterParam = previousGetRouterParam
})

test('billing endpoint returns exact owned recipient organization options without Better Auth SQL', async () => {
  resolverCalls.length = 0
  const result = await handler({ context: { params: { orgId: 'org-source' } } })

  assert.equal(result.status, 200)
  assert.deepEqual(resolverCalls, ['recipient@example.com'])
  assert.equal(result.body.stripe_customer_id, 'cus_source')
  assert.equal(result.body.stripe_subscription_id, 'sub_source')
  assert.equal(result.body.plan, 'growth')
  assert.equal(result.body.status, 'active')
  assert.equal(result.body.current_period_end, '2026-09-08T00:00:00.000Z')
  assert.equal(result.body.cancel_at_period_end, false)
  const pendingTransfer = result.body.pending_transfer as Record<string, unknown>
  assert.equal(pendingTransfer.recipient_ready, true)
  assert.equal(pendingTransfer.recipient_resolution, 'ready')
  assert.deepEqual(pendingTransfer.recipient_organizations, [
    { id: 'org-recipient-a', name: 'Recipient A', slug: 'recipient-a' },
    { id: 'org-recipient-b', name: 'Recipient B', slug: 'recipient-b' },
  ])
})
