import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type Transfer = {
  id: string
  site_id: string
  from_organization_id: string
  to_email: string
  status: string
  requires_payment: number
  claiming_user_id: string | null
  claiming_organization_id: string | null
  stripe_checkout_session_id: string | null
  payment_completed_at: string | null
}

type Recipient = { user_id: string; org_id: string }
type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
const transfer: Transfer = {
  id: 'transfer-1',
  site_id: 'site-source',
  from_organization_id: 'org-source',
  to_email: 'recipient@example.com',
  status: 'pending',
  requires_payment: 1,
  claiming_user_id: null,
  claiming_organization_id: null,
  stripe_checkout_session_id: null,
  payment_completed_at: null,
}
const recipient: Recipient = { user_id: 'user-recipient', org_id: 'org-recipient' }
let effectivePlan = 'growth'
const billingOrganizationIds: string[] = []
const transferCalls: unknown[][] = []
const completionCalls: string[] = []
let completionError: Error | null = null
let requestedOrganizationId = recipient.org_id
let recipientResolutionStatus: 'missing' | 'ambiguous' | 'no_owned_organization' | 'ready' = 'ready'

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
    resolveTransferRecipientOrganizationsForEvent: async () => ({
      email: transfer.to_email,
      status: recipientResolutionStatus,
      userId: recipientResolutionStatus === 'ready' || recipientResolutionStatus === 'no_owned_organization'
        ? recipient.user_id
        : null,
      organizations: recipientResolutionStatus === 'ready'
        ? [{ id: recipient.org_id, name: 'Recipient', slug: 'recipient' }]
        : [],
    }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryAll: async <T>(_db: unknown, query: string): Promise<T[]> => {
      if (query.includes('FROM site_transfer_requests')) return [transfer] as T[]
      throw new Error(`Unexpected queryAll query: ${query}`)
    },
    execute: async (_db: unknown, query: string, params: unknown[]) => {
      if (query.includes('SET claiming_user_id = ?, claiming_organization_id = ?, stripe_checkout_session_id = ?')) {
        transfer.claiming_user_id = String(params[0])
        transfer.claiming_organization_id = String(params[1])
        transfer.stripe_checkout_session_id = String(params[2])
      }
      return { meta: { changes: 1 } }
    },
  },
})

mock.module('../../server/utils/organization-billing.ts', {
  namedExports: {
    getOrganizationBillingProjection: async (_db: unknown, organizationId: string) => {
      billingOrganizationIds.push(organizationId)
      return { effectivePlan }
    },
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    newTransferClaimSentinel: () => 'claim:test-force-accept',
    executeSiteTransfer: async (...args: unknown[]) => {
      transferCalls.push(args)
    },
    completePaidSiteTransfer: async (_env: unknown, _db: unknown, transferId: string) => {
      completionCalls.push(transferId)
      if (completionError) throw completionError
      return { completed: true, restoredDomains: 1 }
    },
  },
})

const previousDefineEventHandler = globalThis.defineEventHandler
const previousGetRouterParam = globalThis.getRouterParam
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: { params?: Record<string, string> }, name: string) => (
  name === 'siteId' ? event.params?.[name] : undefined
)
const previousReadBody = globalThis.readBody
globalThis.readBody = async () => ({ organizationId: requestedOrganizationId })

const { default: handler } = await import('../../server/api/admin/sites/[siteId]/transfer/force-accept.post.ts?billing-authority') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousDefineEventHandler
  globalThis.getRouterParam = previousGetRouterParam
  globalThis.readBody = previousReadBody
})

test.beforeEach(() => {
  effectivePlan = 'growth'
  transfer.requires_payment = 1
  billingOrganizationIds.length = 0
  transferCalls.length = 0
  completionCalls.length = 0
  completionError = null
  requestedOrganizationId = recipient.org_id
  recipientResolutionStatus = 'ready'
  transfer.status = 'pending'
  transfer.claiming_user_id = null
  transfer.claiming_organization_id = null
  transfer.stripe_checkout_session_id = null
  transfer.payment_completed_at = null
})

function invoke() {
  return handler({ params: { siteId: transfer.site_id } })
}

function assertTransferTargetsRecipient() {
  assert.equal(transferCalls.length, 1)
  assert.equal(transferCalls[0]?.[1], transfer.site_id)
  assert.equal(transferCalls[0]?.[2], transfer.from_organization_id)
  assert.equal(transferCalls[0]?.[3], recipient.org_id)
  assert.equal(transferCalls[0]?.[4], transfer.id)
  assert.equal(transferCalls[0]?.[5], recipient.user_id)
}

test('force-accept executes required-payment transfers for an active Growth recipient', async () => {
  for (const plan of ['growth']) {
    effectivePlan = plan
    billingOrganizationIds.length = 0
    transferCalls.length = 0
    completionCalls.length = 0
    transfer.status = 'pending'
    transfer.claiming_user_id = null
    transfer.claiming_organization_id = null
    transfer.stripe_checkout_session_id = null

    const result = await invoke()

    assert.equal(result.status, 200)
    assert.deepEqual(billingOrganizationIds, [recipient.org_id])
    assertTransferTargetsRecipient()
    assert.deepEqual(completionCalls, ['transfer-1'])
  }
})

test('force-accept rejects a required-payment transfer for a free recipient organization', async () => {
  effectivePlan = 'free'

  const result = await invoke()

  assert.equal(result.status, 402)
  assert.match(String(result.body.error), /active billing subscription/)
  assert.deepEqual(billingOrganizationIds, [recipient.org_id])
  assert.equal(transferCalls.length, 0)
})

test('force-accept bypasses billing lookup for a non-payment transfer and still targets the recipient organization', async () => {
  transfer.requires_payment = 0
  effectivePlan = 'free'

  const result = await invoke()

  assert.equal(result.status, 200)
  assert.deepEqual(billingOrganizationIds, [])
  assertTransferTargetsRecipient()
  assert.deepEqual(completionCalls, [])
})

test('force-accept returns a retryable error when legacy domain restoration fails', async () => {
  completionError = new Error('Cloudflare unavailable')

  const result = await invoke()

  assert.equal(result.status, 500)
  assert.match(String(result.body.error), /retry/i)
  assertTransferTargetsRecipient()
  assert.deepEqual(completionCalls, ['transfer-1'])

  transfer.status = 'accepted'
  transfer.claiming_user_id = recipient.user_id
  transfer.claiming_organization_id = recipient.org_id
  transfer.payment_completed_at = null
  completionError = null
  transferCalls.length = 0

  const retry = await invoke()

  assert.equal(retry.status, 200)
  assert.equal(transferCalls.length, 0)
  assert.deepEqual(completionCalls, ['transfer-1', 'transfer-1'])
})

test('force-accept rejects an accepted payment-pending transfer with a mismatched claimant', async () => {
  transfer.status = 'accepted'
  transfer.claiming_user_id = 'other-user'
  transfer.claiming_organization_id = recipient.org_id
  transfer.payment_completed_at = null

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.deepEqual(completionCalls, [])
})

test('force-accept rejects an organization outside the exact recipient owner set', async () => {
  requestedOrganizationId = 'org-unrelated'

  const result = await invoke()

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /not an owner/)
  assert.deepEqual(billingOrganizationIds, [])
  assert.deepEqual(transferCalls, [])
})

test('force-accept rejects ambiguous recipient identity before billing or transfer work', async () => {
  recipientResolutionStatus = 'ambiguous'

  const result = await invoke()

  assert.equal(result.status, 422)
  assert.match(String(result.body.error), /Multiple exact matching/)
  assert.deepEqual(billingOrganizationIds, [])
  assert.deepEqual(transferCalls, [])
})
