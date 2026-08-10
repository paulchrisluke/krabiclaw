import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let projection: { entitlements: Record<string, unknown> }
const queriedTables: string[] = []

mock.module('../../server/utils/organization-billing.ts', {
  namedExports: {
    getOrganizationBillingProjection: async () => projection,
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    createAuth: () => ({}),
    getAuthSession: async () => null,
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    createDb: (db: unknown) => db,
    execute: async () => ({ changes: 0 }),
    executeBatch: async () => [],
    queryAll: async (_db: unknown, query: string) => {
      queriedTables.push(query)
      return [{ key: 'custom_domains' }]
    },
    queryFirst: async () => null,
    schema: {},
  },
})

const { getActiveEntitlements } = await import('../../server/utils/mcp-auth.ts?entitlement-authority')

test('MCP entitlement discovery ignores stale site and organization rows when canonical billing is free', async () => {
  projection = {
    entitlements: {
      custom_domains: false,
      google_business: false,
      managed_service: false,
    },
  }
  queriedTables.length = 0

  const entitlements = await getActiveEntitlements(
    {} as D1Database,
    'org-free',
    ['custom_domains', 'google_business', 'managed_service'],
    'site-stale-paid',
  )

  assert.deepEqual([...entitlements], [])
  assert.deepEqual(queriedTables, [])
})

test('MCP entitlement discovery returns only requested canonical Growth booleans', async () => {
  projection = {
    entitlements: {
      custom_domains: true,
      google_business: true,
      managed_service: true,
      seo_accelerator: false,
      review_requests: 'true',
    },
  }
  queriedTables.length = 0

  const entitlements = await getActiveEntitlements(
    {} as D1Database,
    'org-growth',
    ['custom_domains', 'google_business', 'managed_service', 'seo_accelerator', 'review_requests'],
  )

  assert.deepEqual([...entitlements], ['custom_domains', 'google_business', 'managed_service'])
  assert.deepEqual(queriedTables, [])
})

test('MCP entitlement discovery rejects a malformed canonical projection', async () => {
  projection = {} as typeof projection
  queriedTables.length = 0

  await assert.rejects(
    () => getActiveEntitlements({} as D1Database, 'org-malformed', ['custom_domains']),
    /Invalid organization billing projection entitlements/,
  )
  assert.deepEqual(queriedTables, [])
})
