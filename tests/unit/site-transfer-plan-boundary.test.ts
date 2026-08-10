import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type TransferRow = {
  id: string
  site_id: string
  from_organization_id: string
  to_email: string
  status: string
  invited_plan: string | null
  invited_coupon: string | null
  invited_interval: string | null
  invited_domain: string | null
  requires_payment: number
  stripe_checkout_session_id: string | null
  claiming_user_id: string | null
  claiming_organization_id: string | null
  payment_completed_at: string | null
  custom_domains_removed_at: string | null
  brand_name: string | null
  slug: string
  subdomain: string | null
  initiated_by_name: string
  initiated_by_email: string
  message: string | null
}

type JsonResult = { body: Record<string, unknown>; status: number }

const fakeDb = {}
const transfer: TransferRow = {
  id: 'transfer-1',
  site_id: 'site-source',
  from_organization_id: 'org-source',
  to_email: 'recipient@example.com',
  status: 'pending',
  invited_plan: 'growth',
  invited_coupon: null,
  invited_interval: 'month',
  invited_domain: null,
  requires_payment: 1,
  stripe_checkout_session_id: null,
  claiming_user_id: null,
  claiming_organization_id: null,
  payment_completed_at: null,
  custom_domains_removed_at: null,
  brand_name: 'Transferred site',
  slug: 'transferred-site',
  subdomain: 'transferred-site',
  initiated_by_name: 'Sender',
  initiated_by_email: 'sender@example.com',
  message: null,
}

let sessionEmail = 'recipient@example.com'
let stripeSecret: string | undefined = 'sk_test_transfer'
let existingOwnerOrganizationId: string | null = 'org-recipient'
let organizationCustomerId: string | null = null
let billingCustomerId: string | null = null
let recipientMembershipRole: string | null = 'owner'
let customerMetadata: Record<string, string> = {
  organizationId: 'org-recipient',
  organization_id: 'org-recipient',
  customerType: 'organization',
}
let customerRetrieveError: unknown = null
let couponRetrieveError: unknown = null
let checkoutSessionRetrieveError: unknown = null
let checkoutSessionRetrieveQueue: Array<Record<string, unknown> | { error: unknown }> = []
let existingCheckoutSession: Record<string, unknown> | null = null
let checkoutSessionCreateResponse: Record<string, unknown> | null = null
let checkoutSessionExpireError: unknown = null
let checkoutSessionExpireResponse: Record<string, unknown> = { id: 'cs-transfer', status: 'expired' }
let persistRaceStoresCreatedSession = false
let checkoutPersistFailureConsumed = false
let checkoutPersistRaceReturnZero = false
let checkoutPersistChanges = 1
let previewPriceAmount = 4900
let previewPriceCurrency = 'usd'
let organizationBillingProjection: Record<string, unknown> = {
  organizationId: 'org-recipient',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: 'free',
  effectivePlan: 'free',
  status: 'free',
}
const orgLookups: string[] = []
const orgCreations: string[] = []
const providerCalls: string[] = []
const priceLookups: string[] = []
const dbWrites: Array<{ query: string; params: unknown[] }> = []
const siteTransferCalls: unknown[][] = []
const paidTransferCompletions: string[] = []
let paidTransferCompletionError: Error | null = null
const organizationUpdates: Array<{ organizationId: string; data: Record<string, unknown> }> = []
const checkoutCreates: Array<Record<string, unknown>> = []
let customerCreateOptions: Record<string, unknown> | null = null
let checkoutCreateOptions: Record<string, unknown> | null = null

const stripe = {
  customers: {
    retrieve: async (id: string) => {
      providerCalls.push(`customers.retrieve:${id}`)
      if (customerRetrieveError) throw customerRetrieveError
      return { id, deleted: false, metadata: customerMetadata }
    },
    create: async (_params: Record<string, unknown>, options?: Record<string, unknown>) => {
      providerCalls.push('customers.create')
      customerCreateOptions = options ?? null
      return { id: 'cus-recipient' }
    },
  },
  checkout: {
    sessions: {
      retrieve: async (id: string, _options?: Record<string, unknown>) => {
        providerCalls.push(`checkout.sessions.retrieve:${id}`)
        const queued = checkoutSessionRetrieveQueue.shift()
        if (queued && 'error' in queued) throw queued.error
        if (checkoutSessionRetrieveError) throw checkoutSessionRetrieveError
        if (queued) return queued
        return existingCheckoutSession ?? { id, status: 'open', url: 'https://checkout.example/reused', metadata: { transfer_request_id: transfer.id } }
      },
      create: async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
        providerCalls.push('checkout.sessions.create')
        checkoutCreates.push(params)
        checkoutCreateOptions = options ?? null
        return checkoutSessionCreateResponse ?? { id: 'cs-transfer', status: 'open', url: 'https://checkout.example/new' }
      },
      expire: async (id: string) => {
        providerCalls.push(`checkout.sessions.expire:${id}`)
        if (checkoutSessionExpireError) throw checkoutSessionExpireError
        return { ...checkoutSessionExpireResponse, id: checkoutSessionExpireResponse.id ?? id }
      },
    },
  },
  products: {
    list: async () => {
      providerCalls.push('products.list')
      return {
        data: [{ id: 'prod-growth', metadata: { plan_id: 'growth' } }],
        has_more: false,
      }
    },
  },
  prices: {
    list: async () => {
      providerCalls.push('prices.list')
      return {
        data: [{
          id: 'price-growth-month',
          product: 'prod-growth',
          unit_amount: previewPriceAmount,
          currency: previewPriceCurrency,
          recurring: { interval: 'month', interval_count: 1 },
        }],
        has_more: false,
      }
    },
  },
  coupons: {
    retrieve: async () => {
      providerCalls.push('coupons.retrieve')
      if (couponRetrieveError) throw couponRetrieveError
      return { duration: 'once', duration_in_months: null, percent_off: null, amount_off: null }
    },
  },
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: fakeDb, STRIPE_SECRET_KEY: stripeSecret }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({ user: { id: 'user-recipient', email: sessionEmail, name: 'Recipient' } }),
    createAuth: () => ({ $context: Promise.resolve({}) }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | undefined> => {
      if (query.includes('FROM site_transfer_requests')) return transfer as T
      if (query.includes('FROM organization_billing')) return { stripe_customer_id: billingCustomerId } as T
      throw new Error(`Unexpected queryFirst query: ${query}`)
    },
    execute: async (_db: unknown, query: string, params: unknown[]) => {
      dbWrites.push({ query, params })
      const checkoutPersistQuery = query.includes('SET stripe_checkout_session_id = ?')
        && query.includes('claiming_user_id = ?')
        && query.includes('claiming_organization_id = ?')
      if (checkoutPersistQuery && checkoutPersistChanges === 0 && !persistRaceStoresCreatedSession && !checkoutPersistFailureConsumed) {
        checkoutPersistFailureConsumed = true
        return { meta: { changes: 0 } }
      }
      if (checkoutPersistQuery && checkoutPersistChanges === 0 && persistRaceStoresCreatedSession && !checkoutPersistFailureConsumed) {
        checkoutPersistFailureConsumed = true
        checkoutPersistRaceReturnZero = true
      }
      if (query.includes('SET claiming_user_id = ?, claiming_organization_id = ?, stripe_checkout_session_id = ?')) {
        transfer.claiming_user_id = String(params[0])
        transfer.claiming_organization_id = params[1] == null ? null : String(params[1])
        transfer.stripe_checkout_session_id = String(params[2])
      } else if (query.includes('SET claiming_user_id = NULL')) {
        transfer.claiming_user_id = null
        transfer.claiming_organization_id = null
        transfer.stripe_checkout_session_id = null
      } else if (query.includes('SET stripe_checkout_session_id = ?')) {
        transfer.stripe_checkout_session_id = String(params[0])
      }
      if (checkoutPersistQuery) {
        if (checkoutPersistRaceReturnZero) {
          checkoutPersistRaceReturnZero = false
          return { meta: { changes: 0 } }
        }
        return { meta: { changes: checkoutPersistChanges === 0 ? 1 : checkoutPersistChanges } }
      }
      return { meta: { changes: 1 } }
    },
    executeBatch: async (_db: unknown, queries: Array<{ query: string; params?: unknown[] }>) => {
      for (const query of queries) {
        dbWrites.push({ query: query.query, params: query.params ?? [] })
      }
      return queries.map(() => ({ meta: { changes: 1 } }))
    },
    queryAll: async () => [],
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    isTransferClaimSentinel: (value: string | null | undefined) => typeof value === 'string' && value.startsWith('claim:'),
    isTransferCheckoutPending: (row: typeof transfer) => row.status === 'pending'
      && Boolean(row.stripe_checkout_session_id)
      && !row.stripe_checkout_session_id?.startsWith('claim:')
      && Boolean(row.claiming_user_id)
      && Boolean(row.claiming_organization_id),
    newTransferClaimSentinel: () => 'claim:test-plan-boundary',
    executeSiteTransfer: async (...args: unknown[]) => {
      siteTransferCalls.push(args)
      dbWrites.push({ query: 'executeSiteTransfer', params: [] })
    },
    completePaidSiteTransfer: async (_env: unknown, _db: unknown, transferId: string) => {
      paidTransferCompletions.push(transferId)
      if (paidTransferCompletionError) throw paidTransferCompletionError
      transfer.payment_completed_at = '2026-08-08T12:00:00.000Z'
      return { completed: true, restoredDomains: 0 }
    },
  },
})

mock.module('../../server/utils/organization-billing.ts', {
  namedExports: {
    getOrganizationBillingProjection: async () => billingCustomerId
      ? { ...organizationBillingProjection, stripeCustomerId: billingCustomerId }
      : organizationBillingProjection,
  },
})

mock.module('../../server/utils/site-creation.ts', {
  namedExports: {
    findOldestOwnedOrganization: async (_env: unknown, userId: string) => {
      orgLookups.push(userId)
      return existingOwnerOrganizationId
    },
    createOrganizationForSite: async (_env: unknown, userId: string) => {
      orgCreations.push(userId)
      return { organizationId: 'org-created' }
    },
  },
})

mock.module('../../server/utils/billing.ts', {
  namedExports: {
    getPriceIdForPlan: async (_env: unknown, plan: string) => {
      priceLookups.push(plan)
      return 'price-growth-month'
    },
    getStripe: () => {
      providerCalls.push('getStripe')
      return stripe
    },
  },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => ({
      findMemberByOrgId: async ({ userId, organizationId }: { userId: string; organizationId: string }) => recipientMembershipRole
        ? { userId, organizationId, role: recipientMembershipRole }
        : null,
      findOrganizationById: async () => ({ name: 'Recipient', slug: 'recipient', stripeCustomerId: organizationCustomerId }),
      updateOrganization: async (organizationId: string, data: Record<string, unknown>) => {
        organizationUpdates.push({ organizationId, data })
        return { id: organizationId, name: 'Recipient', slug: 'recipient', ...data }
      },
    }),
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
  readBody: globalThis.readBody,
  getRequestURL: globalThis.getRequestURL,
  createError: globalThis.createError,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: { params?: Record<string, string> }, name: string) => event.params?.[name]
globalThis.readBody = async () => ({})
globalThis.getRequestURL = () => new URL('https://app.example')
globalThis.createError = (input: { statusCode: number; statusMessage?: string }) => Object.assign(new Error(input.statusMessage), input)

const { default: acceptHandler } = await import('../../server/api/site-transfer/[token]/accept.post.ts?plan-boundary-accept') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}
const { default: getHandler } = await import('../../server/api/site-transfer/[token].get.ts?plan-boundary-get') as {
  default: (_event: { params: Record<string, string> }) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
  globalThis.readBody = previousGlobals.readBody
  globalThis.getRequestURL = previousGlobals.getRequestURL
  globalThis.createError = previousGlobals.createError
})

test.beforeEach(() => {
  sessionEmail = 'recipient@example.com'
  stripeSecret = 'sk_test_transfer'
  existingOwnerOrganizationId = 'org-recipient'
  organizationCustomerId = null
  billingCustomerId = null
  recipientMembershipRole = 'owner'
  customerMetadata = {
    organizationId: 'org-recipient',
    organization_id: 'org-recipient',
    customerType: 'organization',
  }
  customerRetrieveError = null
  couponRetrieveError = null
  checkoutSessionRetrieveError = null
  checkoutSessionRetrieveQueue = []
  existingCheckoutSession = null
  checkoutSessionCreateResponse = null
  checkoutSessionExpireError = null
  checkoutSessionExpireResponse = { id: 'cs-transfer', status: 'expired' }
  persistRaceStoresCreatedSession = false
  checkoutPersistFailureConsumed = false
  checkoutPersistRaceReturnZero = false
  checkoutPersistChanges = 1
  previewPriceAmount = 4900
  previewPriceCurrency = 'usd'
  organizationBillingProjection = {
    organizationId: 'org-recipient',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: 'free',
    effectivePlan: 'free',
    status: 'free',
  }
  transfer.status = 'pending'
  transfer.claiming_user_id = null
  transfer.claiming_organization_id = null
  transfer.payment_completed_at = null
  transfer.invited_plan = 'growth'
  transfer.invited_coupon = null
  transfer.requires_payment = 1
  transfer.stripe_checkout_session_id = null
  orgLookups.length = 0
  orgCreations.length = 0
  providerCalls.length = 0
  priceLookups.length = 0
  dbWrites.length = 0
  organizationUpdates.length = 0
  checkoutCreates.length = 0
  siteTransferCalls.length = 0
  paidTransferCompletions.length = 0
  paidTransferCompletionError = null
  customerCreateOptions = null
  checkoutCreateOptions = null
})

function acceptEvent() {
  return { params: { token: 'transfer-token' } }
}

function getEvent() {
  return { params: { token: 'transfer-token' } }
}

test('accept rejects retired and unknown plans before organization or provider access', async () => {
  for (const plan of ['managed', 'seo_accelerator', 'unknown-plan']) {
    transfer.invited_plan = plan
    transfer.requires_payment = 1
    orgLookups.length = 0
    orgCreations.length = 0
    providerCalls.length = 0
    priceLookups.length = 0
    dbWrites.length = 0

    const result = await acceptHandler(acceptEvent())

    assert.equal(result.status, 409)
    assert.match(String(result.body.error), /reissue.*Growth/i)
    assert.deepEqual(orgLookups, [])
    assert.deepEqual(orgCreations, [])
    assert.deepEqual(providerCalls, [])
    assert.deepEqual(priceLookups, [])
    assert.deepEqual(dbWrites, [])
  }
})

test('accept preserves status and recipient-auth checks before plan validation', async () => {
  transfer.invited_plan = 'managed'
  sessionEmail = 'wrong@example.com'

  const unauthorized = await acceptHandler(acceptEvent())

  assert.equal(unauthorized.status, 403)
  assert.deepEqual(orgLookups, [])
  assert.deepEqual(providerCalls, [])

  sessionEmail = 'recipient@example.com'
  transfer.status = 'completed'
  const inactive = await acceptHandler(acceptEvent())

  assert.equal(inactive.status, 410)
  assert.deepEqual(orgLookups, [])
  assert.deepEqual(providerCalls, [])
})

test('accept keeps Growth checkout continuation intact after the plan boundary', async () => {
  transfer.invited_plan = 'growth'

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.checkout_url, 'https://checkout.example/new')
  assert.deepEqual(orgLookups, ['user-recipient'])
  assert.deepEqual(orgCreations, [])
  assert.deepEqual(priceLookups, ['growth'])
  assert.ok(providerCalls.includes('getStripe'))
  assert.ok(providerCalls.includes('customers.create'))
  assert.ok(providerCalls.includes('checkout.sessions.create'))
  assert.deepEqual(organizationUpdates, [{
    organizationId: 'org-recipient',
    data: { stripeCustomerId: 'cus-recipient' },
  }])
  assert.equal(customerCreateOptions?.idempotencyKey, 'krabiclaw:organization-customer:org-recipient')
  assert.equal(checkoutCreateOptions?.idempotencyKey, 'krabiclaw:site-transfer-checkout:transfer-1')
  assert.equal(dbWrites.some(({ query }) => query.includes('organization_billing')), false)
  assert.ok(dbWrites.some(({ query }) => query.includes('site_transfer_requests')))
  const checkoutParams = checkoutCreates[0]
  assert.equal(checkoutParams?.client_reference_id, 'org-recipient')
  assert.equal(checkoutParams?.success_url, 'https://app.example/dashboard/recipient/onboarding?new=true&transfer=transfer-1')
  assert.equal(checkoutParams?.cancel_url, 'https://app.example/dashboard/recipient/onboarding?new=true&payment=cancelled&transfer=transfer-1')
  assert.equal((checkoutParams?.metadata as Record<string, unknown>)?.referenceId, 'org-recipient')
  assert.equal((checkoutParams?.subscription_data as { metadata?: Record<string, unknown> })?.metadata?.referenceId, 'org-recipient')
})

test('accept rejects a malformed Checkout create response before persistence', async () => {
  checkoutSessionCreateResponse = { id: '', status: 'open', url: '' }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.match(String(result.body.error), /failed to start checkout/i)
  assert.equal(dbWrites.some(({ query }) => query.includes('SET stripe_checkout_session_id = ?') && query.includes('claiming_user_id = ?')), false)
})

test('malformed Checkout response with a real session ID still quarantines the provider resource', async () => {
  checkoutSessionCreateResponse = { id: 'cs-malformed', status: 'complete', url: '' }
  existingCheckoutSession = { id: 'cs-malformed', status: 'complete' }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-malformed')
  assert.equal(transfer.claiming_user_id, 'user-recipient')
  assert.ok(providerCalls.includes('checkout.sessions.retrieve:cs-malformed'))
  assert.equal(providerCalls.includes('checkout.sessions.expire:cs-malformed'), false)
})

test('concurrent first acceptance gives one durable claim and one retryable conflict', async () => {
  transfer.claiming_user_id = 'user-other'
  transfer.claiming_organization_id = 'org-other'
  transfer.stripe_checkout_session_id = 'claim:already-reserved'

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 409)
  assert.equal(providerCalls.filter(call => call.includes('customers.') || call.includes('checkout.')).length, 0)
})

test('checkout-pending acceptance rechecks current recipient organization ownership', async () => {
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  recipientMembershipRole = null

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /no longer own/i)
  assert.deepEqual(providerCalls, [])
  assert.equal(checkoutCreates.length, 0)
})

test('accepted paid completion rechecks current recipient organization ownership', async () => {
  transfer.status = 'accepted'
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  recipientMembershipRole = 'admin'

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /no longer own/i)
  assert.deepEqual(paidTransferCompletions, [])
})

test('Checkout persistence loss releases the claim only after expiration is proven', async () => {
  checkoutPersistChanges = 0

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.ok(providerCalls.includes('checkout.sessions.expire:cs-transfer'))
  assert.equal(transfer.stripe_checkout_session_id, null)
  assert.equal(transfer.claiming_user_id, null)
})

test('Checkout persistence CAS race never expires an exact session already bound by another request', async () => {
  checkoutPersistChanges = 0
  persistRaceStoresCreatedSession = true

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-transfer')
  assert.equal(providerCalls.includes('checkout.sessions.retrieve:cs-transfer'), false)
  assert.equal(providerCalls.includes('checkout.sessions.expire:cs-transfer'), false)
})

test('Checkout persistence loss quarantines a completed created session for exact webhook validation', async () => {
  checkoutPersistChanges = 0
  existingCheckoutSession = { id: 'cs-transfer', status: 'complete' }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(providerCalls.includes('checkout.sessions.expire:cs-transfer'), false)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-transfer')
  assert.equal(transfer.claiming_user_id, 'user-recipient')
  assert.equal(providerCalls.includes('checkout.sessions.create'), true)
})

test('Checkout persistence loss retains the exact session when retrieval is ambiguous', async () => {
  checkoutPersistChanges = 0
  checkoutSessionRetrieveError = new Error('Stripe timeout')

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-transfer')
  assert.equal(transfer.claiming_user_id, 'user-recipient')
  assert.equal(providerCalls.includes('checkout.sessions.expire:cs-transfer'), false)
})

test('Checkout persistence loss treats a missing provider resource as unproven, not expired', async () => {
  checkoutPersistChanges = 0
  checkoutSessionRetrieveError = Object.assign(new Error('No such checkout session'), { code: 'resource_missing' })

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-transfer')
  assert.equal(providerCalls.includes('checkout.sessions.expire:cs-transfer'), false)
})

test('Checkout expiration race releases only when the follow-up retrieve proves expired', async () => {
  checkoutPersistChanges = 0
  checkoutSessionRetrieveQueue = [
    { id: 'cs-transfer', status: 'open' },
    { id: 'cs-transfer', status: 'expired' },
  ]
  checkoutSessionExpireError = new Error('Checkout completed while expiring')

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.equal(transfer.stripe_checkout_session_id, null)
  assert.equal(transfer.claiming_user_id, null)
  assert.deepEqual(providerCalls.filter(call => call.startsWith('checkout.sessions.retrieve:')), [
    'checkout.sessions.retrieve:cs-transfer',
    'checkout.sessions.retrieve:cs-transfer',
  ])
})

test('Checkout expiration failure quarantines the exact session when its final state is unknown', async () => {
  checkoutPersistChanges = 0
  checkoutSessionRetrieveQueue = [
    { id: 'cs-transfer', status: 'open' },
    { error: new Error('Stripe timeout') },
  ]
  checkoutSessionExpireError = new Error('Stripe conflict')

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /reconcil/i)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-transfer')
  assert.equal(transfer.claiming_user_id, 'user-recipient')
})

test('accept attaches to an already entitled organization subscription without Stripe checkout', async () => {
  stripeSecret = undefined
  organizationBillingProjection = {
    ...organizationBillingProjection,
    stripeCustomerId: 'cus-existing',
    stripeSubscriptionId: 'sub-existing',
    plan: 'growth',
    effectivePlan: 'growth',
    status: 'active',
  }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  assert.equal(result.body.site_id, 'site-source')
  assert.deepEqual(siteTransferCalls[0]?.slice(0, 6), [
    fakeDb,
    'site-source',
    'org-source',
    'org-recipient',
    'transfer-1',
    'user-recipient',
  ])
  const transferOptions = siteTransferCalls[0]?.[6] as Record<string, unknown>
  assert.match(String(transferOptions?.expectedCheckoutSessionId), /^claim:/)
  assert.equal(transferOptions?.expectedClaimingUserId, 'user-recipient')
  assert.equal(transferOptions?.expectedClaimingOrganizationId, 'org-recipient')
  assert.deepEqual(paidTransferCompletions, ['transfer-1'])
  assert.deepEqual(providerCalls, [])
  assert.deepEqual(organizationUpdates, [])
})

test('accepted entitled handoff retries legacy domain completion for the same claimant', async () => {
  stripeSecret = undefined
  transfer.status = 'accepted'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.payment_completed_at = null

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.success, true)
  assert.deepEqual(paidTransferCompletions, ['transfer-1'])
  assert.equal(siteTransferCalls.length, 0)
})

test('accepted handoff completion rejects an unrelated claimant', async () => {
  transfer.status = 'accepted'
  transfer.claiming_user_id = 'other-user'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.payment_completed_at = null

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 410)
  assert.deepEqual(paidTransferCompletions, [])
})

test('accepted free handoff remains terminal and never enters paid completion', async () => {
  transfer.status = 'accepted'
  transfer.requires_payment = 0
  transfer.invited_plan = null
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.payment_completed_at = null

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 410)
  assert.deepEqual(paidTransferCompletions, [])
})

test('accepted entitled handoff leaves a retryable 500 when legacy restoration fails', async () => {
  stripeSecret = undefined
  transfer.status = 'pending'
  paidTransferCompletionError = new Error('Cloudflare unavailable')
  organizationBillingProjection = {
    ...organizationBillingProjection,
    stripeCustomerId: 'cus-existing',
    stripeSubscriptionId: 'sub-existing',
    plan: 'growth',
    effectivePlan: 'growth',
    status: 'active',
  }

  const first = await acceptHandler(acceptEvent())

  assert.equal(first.status, 500)
  assert.match(String(first.body.error), /retry/i)
  assert.deepEqual(paidTransferCompletions, ['transfer-1'])
  assert.equal(transfer.status, 'pending')

  transfer.status = 'accepted'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  paidTransferCompletionError = null
  const retry = await acceptHandler(acceptEvent())

  assert.equal(retry.status, 200)
  assert.deepEqual(paidTransferCompletions, ['transfer-1', 'transfer-1'])
})

test('accept prefers the Better Auth customer when the billing projection is stale', async () => {
  organizationCustomerId = 'cus-better-auth'
  billingCustomerId = 'cus-projection'

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.checkout_url, 'https://checkout.example/new')
  assert.equal(providerCalls.includes('customers.retrieve:cus-better-auth'), true)
  assert.equal(providerCalls.includes('customers.create'), false)
  assert.deepEqual(organizationUpdates, [])
})

test('accept rejects a Better Auth customer whose Stripe metadata belongs to another organization', async () => {
  organizationCustomerId = 'cus-cross-org'
  customerMetadata = {
    organizationId: 'org-other',
    organization_id: 'org-other',
    customerType: 'organization',
  }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.match(String(result.body.error), /failed to start checkout/i)
  assert.ok(providerCalls.includes('customers.retrieve:cus-cross-org'))
  assert.equal(providerCalls.includes('customers.create'), false)
  assert.equal(providerCalls.includes('checkout.sessions.create'), false)
})

test('accept does not create a duplicate customer when Stripe retrieval fails', async () => {
  organizationCustomerId = 'cus-existing'
  customerRetrieveError = new Error('Stripe network unavailable')

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.match(String(result.body.error), /failed to start checkout/i)
  assert.ok(providerCalls.includes('customers.retrieve:cus-existing'))
  assert.equal(providerCalls.includes('customers.create'), false)
  assert.deepEqual(organizationUpdates, [])
  assert.equal(dbWrites.some(({ query }) => query.includes('SET stripe_checkout_session_id = ?') && query.includes('claiming_user_id = ?')), false)
})

test('accept uses a stale-customer-specific idempotency key when Stripe customer is missing', async () => {
  organizationCustomerId = 'cus-stale'
  customerRetrieveError = Object.assign(new Error('No such customer'), { code: 'resource_missing' })

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(customerCreateOptions?.idempotencyKey, 'krabiclaw:organization-customer:org-recipient:replacement:cus-stale')
})

function reusableTransferCheckout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs-existing',
    status: 'open',
    url: 'https://checkout.example/reused',
    mode: 'subscription',
    customer: 'cus-existing',
    client_reference_id: 'org-recipient',
    metadata: {
      type: 'site_transfer',
      referenceId: 'org-recipient',
      organization_id: 'org-recipient',
      plan: 'growth',
      transfer_request_id: 'transfer-1',
      transfer_site_id: 'site-source',
      transfer_claiming_user_id: 'user-recipient',
      transfer_claiming_organization_id: 'org-recipient',
    },
    line_items: {
      data: [{ quantity: 1, price: { id: 'price-growth-month' } }],
    },
    ...overrides,
  }
}

test('accept reuses only a fully matching open checkout session', async () => {
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  organizationCustomerId = 'cus-existing'
  existingCheckoutSession = reusableTransferCheckout()

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.checkout_url, 'https://checkout.example/reused')
  assert.equal(providerCalls.includes('checkout.sessions.create'), false)
  assert.equal(customerCreateOptions, null)
})

test('accept expires an open mismatched checkout before creating its replacement', async () => {
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  organizationCustomerId = 'cus-existing'
  existingCheckoutSession = reusableTransferCheckout({
    customer: 'cus-other',
  })

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 200)
  assert.ok(providerCalls.includes('checkout.sessions.expire:cs-existing'))
  assert.ok(providerCalls.includes('checkout.sessions.create'))
  assert.equal(checkoutCreateOptions?.idempotencyKey, 'krabiclaw:site-transfer-checkout:transfer-1:replacement:cs-existing')
})

test('accept does not replace an open mismatch unless provider expiration is proven', async () => {
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  organizationCustomerId = 'cus-existing'
  existingCheckoutSession = reusableTransferCheckout({ customer: 'cus-other' })
  checkoutSessionExpireResponse = { id: 'cs-existing', status: 'open' }

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.match(String(result.body.error), /failed to start checkout/i)
  assert.ok(providerCalls.includes('checkout.sessions.expire:cs-existing'))
  assert.equal(providerCalls.includes('checkout.sessions.create'), false)
  assert.equal(transfer.stripe_checkout_session_id, 'cs-existing')
})

test('accept replaces only missing or expired sessions and uses a replacement key', async () => {
  transfer.stripe_checkout_session_id = 'cs-expired'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  organizationCustomerId = 'cus-existing'

  existingCheckoutSession = { id: 'cs-expired', status: 'expired' }
  let result = await acceptHandler(acceptEvent())
  assert.equal(result.status, 200)
  assert.equal(checkoutCreateOptions?.idempotencyKey, 'krabiclaw:site-transfer-checkout:transfer-1:replacement:cs-expired')

  checkoutCreates.length = 0
  checkoutCreateOptions = null
  existingCheckoutSession = null
  checkoutSessionRetrieveError = Object.assign(new Error('No such checkout session'), { code: 'resource_missing' })
  result = await acceptHandler(acceptEvent())
  assert.equal(result.status, 200)
  assert.equal(checkoutCreateOptions?.idempotencyKey, 'krabiclaw:site-transfer-checkout:transfer-1:replacement:cs-transfer')
})

test('accept rethrows unknown checkout retrieval failures instead of creating a duplicate', async () => {
  transfer.stripe_checkout_session_id = 'cs-existing'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  organizationCustomerId = 'cus-existing'
  checkoutSessionRetrieveError = new Error('Stripe timeout')

  const result = await acceptHandler(acceptEvent())

  assert.equal(result.status, 500)
  assert.equal(providerCalls.includes('checkout.sessions.create'), false)
})

test('GET rejects missing, retired, and unknown plans before Stripe pricing reads', async () => {
  for (const plan of [null, 'managed', 'seo_accelerator', 'unknown-plan']) {
    transfer.invited_plan = plan
    transfer.requires_payment = 1
    providerCalls.length = 0

    const result = await getHandler(getEvent())

    assert.equal(result.status, 409)
    assert.match(String(result.body.error), /reissue.*Growth/i)
    assert.deepEqual(providerCalls, [])
  }
})

test('GET fails closed when a paid handoff has no Stripe secret', async () => {
  transfer.invited_plan = 'growth'
  stripeSecret = undefined

  const result = await getHandler(getEvent())

  assert.equal(result.status, 503)
  assert.match(String(result.body.error), /Stripe pricing/i)
  assert.deepEqual(providerCalls, [])
})

test('GET keeps Growth pricing continuation intact', async () => {
  transfer.invited_plan = 'growth'

  const result = await getHandler(getEvent())

  assert.equal(result.status, 200)
  assert.equal(result.body.invited_plan, 'growth')
  assert.deepEqual(result.body.pricing_month, {
    base_cents: 4900,
    discounted_cents: null,
    coupon_duration: null,
    coupon_duration_months: null,
  })
  assert.ok(providerCalls.includes('getStripe'))
  assert.ok(providerCalls.includes('products.list'))
  assert.ok(providerCalls.includes('prices.list'))
})

test('GET fails closed when the Growth preview price drifts from USD 4900', async () => {
  for (const [amount, currency] of [[3900, 'usd'], [4900, 'eur']] as const) {
    transfer.invited_plan = 'growth'
    previewPriceAmount = amount
    previewPriceCurrency = currency

    await assert.rejects(
      () => getHandler(getEvent()),
      /Growth monthly price must be exactly USD 4900 cents/,
    )
  }
})

test('GET fails closed when a stored transfer coupon is missing', async () => {
  transfer.invited_plan = 'growth'
  transfer.invited_coupon = 'coupon-retired'
  couponRetrieveError = Object.assign(new Error('No such coupon'), { code: 'resource_missing' })

  const result = await getHandler(getEvent())

  assert.equal(result.status, 409)
  assert.match(String(result.body.error), /discount.*available|reissue/i)
  assert.ok(providerCalls.includes('coupons.retrieve'))
})
