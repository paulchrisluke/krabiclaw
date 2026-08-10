import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const db = {}
const dashboardCalls: Array<Record<string, unknown>> = []
let exactTransferRow: { id: string } | null = { id: 'site-transfer' }
let transferState: 'accepted' | 'checkout_pending' | 'accepted_payment_pending' = 'accepted'

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('t.status = \'pending\'')) {
        return transferState === 'checkout_pending' && exactTransferRow
          ? { id: 'transfer-exact' } as T
          : null
      }
      if (query.includes("t.status = 'accepted'") && query.includes('payment_completed_at IS NULL')) {
        return transferState === 'accepted_payment_pending' && exactTransferRow
          ? { id: 'transfer-exact' } as T
          : null
      }
      if (query.includes('t.id = ?')) return exactTransferRow as T | null
      if (query.includes('accepted_by_user_id = ?')) return { subdomain: 'legacy-transfer-site' } as T
      return null
    },
    queryAll: async () => [{
      id: 'location-1',
      title: 'Main',
      slug: 'main',
      is_primary: 1,
      notification_phone: null,
    }],
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: db }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({ user: { id: 'user-recipient' } }),
  },
})

mock.module('../../server/utils/dashboard-context-service.ts', {
  namedExports: {
    loadDashboardContext: async (_event: unknown, scope: Record<string, unknown>) => {
      dashboardCalls.push(scope)
      const siteId = scope.siteId as string | undefined
      const siteSlug = scope.siteSlug as string | undefined
      return {
        organization: {
          id: 'org-recipient',
          slug: 'recipient',
          name: 'Recipient',
          role: 'owner',
          memberId: 'member-recipient',
        },
        site: siteId || siteSlug
          ? {
              id: siteId ?? 'site-transfer',
              organization_id: 'org-recipient',
              brand_name: 'Transferred',
              vertical: 'experience',
              subdomain: siteSlug ?? null,
              plan: 'growth',
            }
          : null,
      }
    },
  },
})

mock.module('../../server/utils/mcp-workflows.ts', {
  namedExports: {
    getNotificationsSettings: async () => ({ whatsapp_phone: null, channels: [] }),
  },
})

const previousCreateError = globalThis.createError
globalThis.createError = (input: { statusCode?: number; statusMessage?: string }) =>
  Object.assign(new Error(input.statusMessage), input)

const { loadTransferOnboardingContext } = await import('../../server/utils/transfer-onboarding-context.ts?exact-transfer')

test.after(() => {
  globalThis.createError = previousCreateError
})

test.beforeEach(() => {
  dashboardCalls.length = 0
  exactTransferRow = { id: 'site-transfer' }
  transferState = 'accepted'
})

test('exact transfer scope selects only the accepted transfer claimed by the current org and user', async () => {
  const result = await loadTransferOnboardingContext({} as never, {
    orgSlug: 'recipient',
    transferId: 'transfer-exact',
  })

  assert.equal(result.site.id, 'site-transfer')
  assert.equal(result.site.subdomain, null)
  assert.deepEqual(dashboardCalls.map(call => call.siteId), [undefined, 'site-transfer'])
  assert.deepEqual(dashboardCalls.map(call => call.siteSlug), [undefined, undefined])
})

test('exact transfer scope fails closed when the transfer is missing or not claimed by the session', async () => {
  exactTransferRow = null

  await assert.rejects(
    () => loadTransferOnboardingContext({} as never, {
      orgSlug: 'recipient',
      transferId: 'transfer-other',
    }),
    /Transferred site not found/,
  )
  assert.deepEqual(dashboardCalls.map(call => call.siteSlug), [undefined])
})

test('checkout-pending exact claimant receives a typed payment-pending context', async () => {
  transferState = 'checkout_pending'

  const result = await loadTransferOnboardingContext({} as never, {
    orgSlug: 'recipient',
    transferId: 'transfer-exact',
  })

  assert.deepEqual(result, {
    success: true,
    state: 'payment_pending',
    transfer_id: 'transfer-exact',
  })
  assert.deepEqual(dashboardCalls.map(call => call.siteId), [undefined])
})

test('accepted paid transfer remains payment-pending until completion is recorded', async () => {
  transferState = 'accepted_payment_pending'

  const result = await loadTransferOnboardingContext({} as never, {
    orgSlug: 'recipient',
    transferId: 'transfer-exact',
  })

  assert.deepEqual(result, {
    success: true,
    state: 'payment_pending',
    transfer_id: 'transfer-exact',
  })
  assert.deepEqual(dashboardCalls.map(call => call.siteId), [undefined])
})

test('legacy onboarding URLs retain the latest accepted-transfer fallback', async () => {
  const result = await loadTransferOnboardingContext({} as never, { orgSlug: 'recipient' })

  assert.equal(result.site.subdomain, 'legacy-transfer-site')
  assert.equal(dashboardCalls[0]?.afterTransfer, true)
})

test('malformed explicit transfer scopes fail before legacy discovery', async () => {
  for (const transferId of ['', '   ', ' transfer-exact', 'transfer-exact ', null, ['transfer-exact'], 42]) {
    dashboardCalls.length = 0
    await assert.rejects(
      () => loadTransferOnboardingContext({} as never, {
        orgSlug: 'recipient',
        transferId: transferId as never,
      }),
      (error: unknown) => {
        const candidate = error as { statusCode?: number }
        return candidate.statusCode === 400
      },
    )
    assert.deepEqual(dashboardCalls, [])
  }
})
