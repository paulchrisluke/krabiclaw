import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const executed: Array<{ query: string; params: unknown[] }> = []
const queried: Array<{ query: string; params: unknown[] }> = []
const pendingRow = {
  id: 'stripe-ga4-intent-1',
  organizationId: 'org-1',
  userId: 'user-1',
  stripeSubscriptionId: 'sub-1',
  action: 'upgrade' as const,
  siteId: 'site-1',
  clientId: '123.456',
  sessionId: '1760000123',
  sessionCapturedAt: 1760000123,
  previousPriceId: 'price_old',
  newPriceId: 'price_new',
  effectiveTiming: 'immediate' as const,
  source: 'browser',
  status: 'pending' as const,
  lifecycleSentAt: null,
  consumedAt: null,
  consumedEventId: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-08-07T00:00:00.000Z',
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (_db: unknown, query: string, params: unknown[]) => {
      executed.push({ query, params })
      return { meta: { changes: 1 } }
    },
    queryFirst: async (_db: unknown, query: string, params: unknown[]) => {
      queried.push({ query, params })
      return pendingRow
    },
  },
})

const {
  recordStripeGa4Intent,
  findPendingStripeGa4Intent,
  findConsumedStripeGa4CancellationIntent,
  markStripeGa4IntentLifecycleSent,
  consumeStripeGa4Intent,
} = await import('../../server/utils/stripe-ga4-intents.ts')

test('intent persistence carries browser identity and change timing into the ledger', async () => {
  executed.length = 0
  const intent = await recordStripeGa4Intent({} as never, {
    organizationId: 'org-1',
    userId: 'user-1',
    stripeSubscriptionId: 'sub-1',
    action: 'upgrade',
    siteId: 'site-1',
    clientId: '123.456',
    sessionId: '1760000123',
    sessionCapturedAt: 1760000123,
    previousPriceId: 'price_old',
    newPriceId: 'price_new',
    effectiveTiming: 'immediate',
  })

  assert.equal(intent.action, 'upgrade')
  assert.equal(intent.effectiveTiming, 'immediate')
  assert.match(executed[0]?.query ?? '', /INSERT INTO stripe_ga4_subscription_intents/)
  assert.equal(executed[0]?.params.includes('123.456'), true)
  assert.equal(executed[0]?.params.some(value => String(value) === '1760000123'), true)
})

test('pending intents are consumed after lifecycle or paid-invoice delivery', async () => {
  const found = await findPendingStripeGa4Intent({} as never, 'sub-1', '2026-08-07T00:00:00.000Z')
  assert.deepEqual(found, pendingRow)

  executed.length = 0
  await markStripeGa4IntentLifecycleSent({} as never, pendingRow.id)
  await consumeStripeGa4Intent({} as never, pendingRow.id, 'evt_invoice_1')
  assert.match(executed[0]?.query ?? '', /lifecycle_sent_at/)
  assert.match(executed[1]?.query ?? '', /status = 'consumed'/)
  assert.equal(executed[1]?.params.at(-3), 'evt_invoice_1')
})

test('cancellation dedupe lookup is scoped to consumed scheduled free-plan downgrades', async () => {
  executed.length = 0
  queried.length = 0
  await findConsumedStripeGa4CancellationIntent({} as never, 'sub-1')
  assert.match(queried[0]?.query ?? '', /new_price_id IS NULL/)
  assert.match(queried[0]?.query ?? '', /lifecycle_sent_at IS NOT NULL/)
  assert.equal(queried[0]?.params[0], 'sub-1')
})
