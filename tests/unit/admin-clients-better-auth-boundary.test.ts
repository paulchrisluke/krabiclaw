import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
const adapterCalls: Array<{ method: string; input: Record<string, unknown> }> = []
let rows: Array<Record<string, unknown>> = []
let organizations = new Map<string, Record<string, unknown>>()
let members = new Map<string, Array<Record<string, unknown>>>()

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
    platformPermissionError: () => ({ statusCode: 403, message: 'Platform admin access required' }),
    requirePlatformEventPermission: async () => undefined,
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
      findOrganizationById: async (organizationId: string) => {
        adapterCalls.push({ method: 'findOrganizationById', input: { organizationId } })
        return organizations.get(organizationId) ?? null
      },
      listMembers: async (input: Record<string, unknown>) => {
        adapterCalls.push({ method: 'listMembers', input })
        const organizationId = String(input.organizationId)
        const filter = input.filter as { value?: unknown } | undefined
        const role = String(filter?.value ?? '')
        return {
          members: (members.get(`${organizationId}:${role}`) ?? []),
          total: (members.get(`${organizationId}:${role}`) ?? []).length,
        }
      },
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async <T>(_db: unknown, query: string): Promise<T[]> => {
      assert.match(query, /FROM organization_billing/i)
      assert.doesNotMatch(query, /(?:FROM|JOIN)\s+(?:organization|member)(?:\s|$)/i)
      assert.doesNotMatch(query, /site_billing/i)
      return rows as T[]
    },
  },
})

const previousDefineEventHandler = globalThis.defineEventHandler
globalThis.defineEventHandler = (handler: unknown) => handler

const { default: handler } = await import('../../server/api/admin/clients.get.ts?better-auth-boundary') as {
  default: (_event: Record<string, unknown>) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousDefineEventHandler
})

test('admin clients resolves identity and workspace owner through Better Auth without auth SQL', async () => {
  rows = [
    {
      org_id: 'org-growth',
      org_name: null,
      org_slug: null,
      plan: 'growth',
      site_id: 'site-growth',
      brand_name: 'Growth site',
      subdomain: 'growth',
      custom_domain: null,
      source_locale: 'en',
      subscription_status: 'active',
      current_period_end: '2026-09-01T00:00:00.000Z',
      stripe_customer_id: 'cus-growth',
      stripe_subscription_id: 'sub-growth',
      pending_transfer_email: null,
      impersonation_user_id: null,
      created_at: null,
    },
  ]
  organizations = new Map([
    ['org-growth', { id: 'org-growth', name: 'Growth org', slug: 'growth-org', createdAt: new Date('2026-03-01T00:00:00.000Z') }],
  ])
  members = new Map([
    ['org-growth:owner', [
      { id: 'owner-new', userId: 'user-new', role: 'owner', createdAt: new Date('2026-02-02T00:00:00.000Z') },
      { id: 'owner-old', userId: 'user-old', role: 'owner', createdAt: new Date('2026-01-02T00:00:00.000Z') },
    ]],
  ])
  adapterCalls.length = 0

  const result = await handler({})

  assert.equal(result.status, 200)
  const clients = result.body.clients as Array<Record<string, unknown>>
  assert.deepEqual(clients.map(client => [client.org_id, client.plan, client.impersonation_user_id]), [
    ['org-growth', 'growth', 'user-old'],
  ])
  assert.equal(clients[0]?.org_name, 'Growth org')
  assert.equal(clients[0]?.org_slug, 'growth-org')
  assert.equal(clients[0]?.created_at, '2026-03-01T00:00:00.000Z')

  const memberCalls = adapterCalls.filter(call => call.method === 'listMembers')
  assert.ok(memberCalls.every(call => (
    call.input.sortBy === 'createdAt'
    && call.input.sortOrder === 'asc'
    && (call.input.filter as { field?: unknown }).field === 'role'
    && (call.input.filter as { operator?: unknown }).operator === 'eq'
  )))
})

test('admin clients fails closed when an app billing row references a missing Better Auth organization', async () => {
  rows = [{ org_id: 'org-missing', plan: 'growth' }]
  organizations = new Map()
  members = new Map()

  await assert.rejects(
    () => handler({}),
    /Better Auth organization org-missing is unavailable or malformed/,
  )
})

test('admin clients fails closed when Better Auth returns malformed member data', async () => {
  rows = [{ org_id: 'org-malformed', plan: 'growth' }]
  organizations = new Map([
    ['org-malformed', { id: 'org-malformed', name: 'Malformed org', slug: 'malformed-org', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
  ])
  members = new Map([
    ['org-malformed:owner', [{ role: 'owner', userId: 'user-missing-created-at' }]],
  ])

  await assert.rejects(
    () => handler({}),
    /returned a malformed owner member|without createdAt/,
  )
})
