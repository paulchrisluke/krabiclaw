import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type TransferRow = {
  id: string
  site_id: string
  from_organization_id: string
  status: string
  requires_payment: number
  stripe_checkout_session_id: string | null
  claiming_user_id: string | null
  claiming_organization_id: string | null
  payment_completed_at: string | null
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
}

const transfer: TransferRow = {
  id: 'transfer-race',
  site_id: 'site-race',
  from_organization_id: 'org-source',
  status: 'pending',
  requires_payment: 0,
  claiming_user_id: null,
  claiming_organization_id: null,
  payment_completed_at: null,
  custom_domains_snapshot: null,
  custom_domains_removed_at: null,
  stripe_checkout_session_id: null,
}
let executeChanges = 1
const executeQueries: string[] = []
const reminderNotifications: unknown[] = []
let deleteDomainCalls = 0
let restoreDomainCalls = 0
let restoreError: Error | null = null
let checkoutStatus: 'open' | 'expired' | 'complete' = 'open'
let checkoutExpireResponseStatus: 'open' | 'expired' | 'complete' = 'expired'
const checkoutProviderCalls: string[] = []

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('FROM site_transfer_requests')) return transfer as T
      return null
    },
    queryAll: async () => [{
      id: transfer.id,
      site_id: transfer.site_id,
      from_organization_id: transfer.from_organization_id,
      to_email: 'recipient@example.com',
      token: 'token-race',
      created_at: '2026-07-01T00:00:00.000Z',
      invited_plan: 'growth',
      invited_domain: null,
      reminder_count: 0,
      requires_payment: 1,
      custom_domains_snapshot: null,
      custom_domains_removed_at: null,
      site_name: 'Race fixture',
    }],
    execute: async (_db: unknown, query: string) => {
      executeQueries.push(query)
      if (executeChanges > 0 && query.includes("SET status = 'cancelled'")) {
        transfer.status = 'cancelled'
      }
      if (executeChanges > 0 && query.includes('custom_domains_removed_at = NULL')) {
        transfer.custom_domains_removed_at = null
      }
      if (executeChanges > 0 && query.includes('SET payment_completed_at =')) {
        transfer.payment_completed_at = '2026-08-08T12:00:00.000Z'
      }
      return { meta: { changes: executeChanges } }
    },
    executeBatch: async () => [],
  },
})

mock.module('../../server/utils/domains.ts', {
  namedExports: {
    createCustomDomainPair: async () => {
      restoreDomainCalls += 1
      if (restoreError) throw restoreError
    },
    deleteCustomDomain: async () => {
      deleteDomainCalls += 1
    },
  },
})

mock.module('../../server/utils/site-transfer-notifications.ts', {
  namedExports: {
    notifySiteTransferReminder: async (...args: unknown[]) => {
      reminderNotifications.push(args)
    },
  },
})

mock.module('../../server/utils/billing.ts', {
  namedExports: {
    getStripe: () => ({
      checkout: {
        sessions: {
          retrieve: async (id: string) => {
            checkoutProviderCalls.push(`retrieve:${id}`)
            return { id, status: checkoutStatus }
          },
          expire: async (id: string) => {
            checkoutProviderCalls.push(`expire:${id}`)
            checkoutStatus = checkoutExpireResponseStatus
            return { id, status: checkoutExpireResponseStatus }
          },
        },
      },
    }),
  },
})

const {
  cancelPendingSiteTransfer,
  completePaidSiteTransfer,
  parseTransferDomainSnapshot,
  processSiteTransferReminders,
} = await import('../../server/utils/site-transfer.ts?transfer-races')

test.beforeEach(() => {
  transfer.status = 'pending'
  transfer.requires_payment = 0
  transfer.claiming_user_id = null
  transfer.claiming_organization_id = null
  transfer.payment_completed_at = null
  transfer.custom_domains_snapshot = null
  transfer.custom_domains_removed_at = null
  transfer.stripe_checkout_session_id = null
  executeChanges = 1
  executeQueries.length = 0
  reminderNotifications.length = 0
  deleteDomainCalls = 0
  restoreDomainCalls = 0
  restoreError = null
  checkoutStatus = 'open'
  checkoutExpireResponseStatus = 'expired'
  checkoutProviderCalls.length = 0
})

test('cancellation loses a pending-state race without reporting a false cancellation', async () => {
  executeChanges = 0

  const result = await cancelPendingSiteTransfer(
    {} as never,
    {} as never,
    transfer.id,
  )

  assert.deepEqual(result, { cancelled: false, customDomainsDeleted: 0 })
  assert.match(executeQueries[0] ?? '', /WHERE id = \? AND status = 'pending'/)
})

test('cancellation cannot win while a Checkout claim sentinel may be creating a provider resource', async () => {
  transfer.requires_payment = 1
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.stripe_checkout_session_id = 'claim:provider-create-in-flight'

  const result = await cancelPendingSiteTransfer(
    { STRIPE_SECRET_KEY: 'sk_test_transfer' } as never,
    {} as never,
    transfer.id,
  )

  assert.deepEqual(result, { cancelled: false, customDomainsDeleted: 0 })
  assert.equal(transfer.status, 'pending')
  assert.deepEqual(executeQueries, [])
  assert.deepEqual(checkoutProviderCalls, [])
})

test('reminders never auto-delete domains and only count a pending-row update', async () => {
  executeChanges = 1

  const result = await processSiteTransferReminders(
    { NUXT_PUBLIC_PLATFORM_DOMAIN: 'krabiclaw.com' } as never,
    {} as never,
    { force: true, now: new Date('2026-08-08T00:00:00.000Z') },
  )

  assert.deepEqual(result, { reminded: 1, paused_domains: 0, checked: 1 })
  assert.equal(deleteDomainCalls, 0)
  assert.equal(reminderNotifications.length, 1)
  const reminderOptions = reminderNotifications[0]?.[2] as { customDomainsPaused?: unknown } | undefined
  assert.equal(reminderOptions?.customDomainsPaused, false)
  assert.match(executeQueries[0] ?? '', /WHERE id = \? AND status = 'pending'/)
})

test('cancellation claims terminal state before historical domain restoration', async () => {
  transfer.requires_payment = 1
  transfer.custom_domains_snapshot = JSON.stringify([{ domain: 'example.com', include_www: false }])
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'

  const result = await cancelPendingSiteTransfer(
    {} as never,
    {} as never,
    transfer.id,
  )

  assert.deepEqual(result, { cancelled: true, customDomainsDeleted: 1 })
  assert.equal(transfer.status, 'cancelled')
  assert.equal(transfer.custom_domains_removed_at, null)
  assert.equal(restoreDomainCalls, 1)
  assert.ok(executeQueries[0]?.includes("SET status = 'cancelled'"))
  assert.ok(executeQueries.findIndex(query => query.includes("SET status = 'cancelled'")) < executeQueries.findIndex(query => query.includes('SET custom_domains_removed_at = NULL')))
})

test('failed historical restoration leaves cancelled cleanup-pending state retryable', async () => {
  transfer.requires_payment = 1
  transfer.custom_domains_snapshot = JSON.stringify([{ domain: 'example.com', include_www: false }])
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  restoreError = new Error('Cloudflare unavailable')

  await assert.rejects(
    () => cancelPendingSiteTransfer({} as never, {} as never, transfer.id),
    /Cloudflare unavailable/,
  )
  assert.equal(transfer.status, 'cancelled')
  assert.equal(transfer.custom_domains_removed_at, '2026-07-15T00:00:00.000Z')

  restoreError = null
  executeChanges = 1
  const retry = await cancelPendingSiteTransfer({} as never, {} as never, transfer.id)
  assert.deepEqual(retry, { cancelled: true, customDomainsDeleted: 1 })
  assert.equal(transfer.status, 'cancelled')
  assert.equal(transfer.custom_domains_removed_at, null)
})

test('cancellation refuses to clear a legacy removal marker without its snapshot', async () => {
  transfer.status = 'pending'
  transfer.requires_payment = 1
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  transfer.custom_domains_snapshot = null

  await assert.rejects(
    () => cancelPendingSiteTransfer({} as never, {} as never, transfer.id),
    /restoration snapshot/,
  )
  assert.equal(transfer.status, 'pending')
  assert.equal(transfer.custom_domains_removed_at, '2026-07-15T00:00:00.000Z')
})

test('paid completion refuses to clear a legacy removal marker without its snapshot', async () => {
  transfer.status = 'accepted'
  transfer.requires_payment = 1
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  transfer.custom_domains_snapshot = null

  await assert.rejects(
    () => completePaidSiteTransfer({} as never, {} as never, transfer.id),
    /restoration snapshot/,
  )
  assert.equal(transfer.custom_domains_removed_at, '2026-07-15T00:00:00.000Z')
  assert.equal(transfer.payment_completed_at, null)
})

test('paid completion restores a legacy marker before clearing it and stamping payment', async () => {
  transfer.status = 'accepted'
  transfer.requires_payment = 1
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  transfer.custom_domains_snapshot = JSON.stringify([{ domain: 'example.com', include_www: false }])

  const result = await completePaidSiteTransfer({} as never, {} as never, transfer.id)

  assert.deepEqual(result, { completed: true, restoredDomains: 1 })
  assert.equal(restoreDomainCalls, 1)
  assert.equal(transfer.custom_domains_removed_at, null)
  assert.equal(transfer.payment_completed_at, '2026-08-08T12:00:00.000Z')
})

test('domain snapshot parsing preserves empty values and rejects malformed or unsafe entries', () => {
  assert.deepEqual(parseTransferDomainSnapshot(null), [])
  assert.deepEqual(parseTransferDomainSnapshot(''), [])
  assert.deepEqual(parseTransferDomainSnapshot('[]'), [])
  assert.deepEqual(
    parseTransferDomainSnapshot(JSON.stringify([
      { domain: 'example.com', include_www: false },
      { domain: 'WWW.EXAMPLE.COM', include_www: true },
    ])),
    [{ domain: 'example.com', include_www: true }],
  )

  for (const raw of [
    '{"domain":"example.com"}',
    '[{"domain":"example.com"}]',
    '[{"domain":"example.com","include_www":"yes"}]',
    '[{"domain":"not a domain","include_www":true}]',
    '[{"domain":"example.com","include_www":true,"extra":1}]',
    'not-json',
  ]) {
    assert.throws(() => parseTransferDomainSnapshot(raw), /restoration snapshot/)
  }
})

test('cancellation rejects a malformed legacy snapshot before provider calls or marker clearing', async () => {
  transfer.status = 'pending'
  transfer.requires_payment = 1
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  transfer.custom_domains_snapshot = '{"domain":"example.com"}'

  await assert.rejects(
    () => cancelPendingSiteTransfer({ STRIPE_SECRET_KEY: 'sk_test_transfer' } as never, {} as never, transfer.id),
    /restoration snapshot/,
  )
  assert.equal(restoreDomainCalls, 0)
  assert.equal(transfer.custom_domains_removed_at, '2026-07-15T00:00:00.000Z')
  assert.deepEqual(executeQueries, [])
})

test('paid completion rejects an invalid legacy domain before provider calls or marker clearing', async () => {
  transfer.status = 'accepted'
  transfer.requires_payment = 1
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  transfer.custom_domains_removed_at = '2026-07-15T00:00:00.000Z'
  transfer.custom_domains_snapshot = JSON.stringify([{ domain: 'not a domain', include_www: true }])

  await assert.rejects(
    () => completePaidSiteTransfer({} as never, {} as never, transfer.id),
    /restoration snapshot/,
  )
  assert.equal(restoreDomainCalls, 0)
  assert.equal(transfer.custom_domains_removed_at, '2026-07-15T00:00:00.000Z')
  assert.equal(transfer.payment_completed_at, null)
  assert.deepEqual(executeQueries, [])
})

test('a reminder that loses its pending-state race is not counted as sent', async () => {
  executeChanges = 0

  const result = await processSiteTransferReminders(
    { NUXT_PUBLIC_PLATFORM_DOMAIN: 'krabiclaw.com' } as never,
    {} as never,
    { force: true, now: new Date('2026-08-08T00:00:00.000Z') },
  )

  assert.deepEqual(result, { reminded: 0, paused_domains: 0, checked: 1 })
  assert.equal(deleteDomainCalls, 0)
})

test('cancellation expires an exact open Checkout before terminal CAS', async () => {
  transfer.status = 'pending'
  transfer.stripe_checkout_session_id = 'cs-open'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'

  const result = await cancelPendingSiteTransfer(
    { STRIPE_SECRET_KEY: 'sk_test_transfer' } as never,
    {} as never,
    transfer.id,
  )

  assert.equal(result.cancelled, true)
  assert.deepEqual(checkoutProviderCalls, ['retrieve:cs-open', 'expire:cs-open'])
  assert.equal(transfer.status, 'cancelled')
  assert.ok(executeQueries.some(query => query.includes('stripe_checkout_session_id = ?')))
})

test('cancellation keeps an exact Checkout pending when expiration is not proven', async () => {
  transfer.status = 'pending'
  transfer.stripe_checkout_session_id = 'cs-open'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  checkoutExpireResponseStatus = 'open'

  await assert.rejects(
    () => cancelPendingSiteTransfer(
      { STRIPE_SECRET_KEY: 'sk_test_transfer' } as never,
      {} as never,
      transfer.id,
    ),
    /expiration was not proven/,
  )

  assert.equal(transfer.status, 'pending')
  assert.deepEqual(checkoutProviderCalls, [
    'retrieve:cs-open',
    'expire:cs-open',
    'retrieve:cs-open',
    'retrieve:cs-open',
  ])
})

test('completed Checkout is never reported as cancelled', async () => {
  transfer.status = 'pending'
  transfer.stripe_checkout_session_id = 'cs-complete'
  transfer.claiming_user_id = 'user-recipient'
  transfer.claiming_organization_id = 'org-recipient'
  checkoutStatus = 'complete'

  const result = await cancelPendingSiteTransfer(
    { STRIPE_SECRET_KEY: 'sk_test_transfer' } as never,
    {} as never,
    transfer.id,
  )

  assert.deepEqual(result, { cancelled: false, customDomainsDeleted: 0, reason: 'payment_completed' })
  assert.equal(transfer.status, 'pending')
  assert.deepEqual(checkoutProviderCalls, ['retrieve:cs-complete'])
})
