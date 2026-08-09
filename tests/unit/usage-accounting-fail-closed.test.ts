import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const executeCalls: Array<{ query: string; params: unknown[] }> = []
const chargeCalls: Array<{ organizationId: string; opts: Record<string, unknown> }> = []

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (_db: unknown, query: string, params: unknown[] = []) => {
      executeCalls.push({ query, params })
      return { meta: { changes: 1 } }
    },
    queryFirst: async () => {
      throw new Error('membership query unavailable')
    },
  },
})

mock.module('../../server/utils/ai-credits.ts', {
  namedExports: {
    chargeFlatCredits: async (db: unknown, organizationId: string, opts: Record<string, unknown>) => {
      chargeCalls.push({ organizationId, opts })
      throw new Error('usage ledger unavailable')
    },
  },
})

const { sendWhatsAppNotification } = await import('../../server/utils/whatsapp.ts')

test('successful WhatsApp sends preserve sent notification evidence when accounting fails', async () => {
  executeCalls.length = 0
  chargeCalls.length = 0
  mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ messages: [{ id: 'wamid.accounting-failure' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ))

  await assert.rejects(
    () => sendWhatsAppNotification(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'phone-number-id',
        WHATSAPP_ACCESS_TOKEN: 'test-mode-token',
        WHATSAPP_DELIVERY_MODE: 'provider',
      },
      {} as never,
      {
        organizationId: 'org-accounting-failure',
        siteId: 'site-accounting-failure',
        toPhone: '+66946230215',
        template: 'low_credits',
        vars: { credits_remaining: '0', upgrade_url: 'https://krabiclaw.com/dashboard/billing' },
      },
    ),
    /credit accounting failed: usage ledger unavailable/,
  )

  assert.deepEqual(chargeCalls, [{
    organizationId: 'org-accounting-failure',
    opts: {
      siteId: 'site-accounting-failure',
      action: 'whatsapp_notification',
      idempotencyKey: 'whatsapp-provider:wamid.accounting-failure',
    },
  }])
  const sentUpdate = executeCalls.find(call => call.query.includes("SET status = 'sent'"))
  assert.ok(sentUpdate, 'provider message evidence must be persisted before accounting')
  assert.ok(sentUpdate?.params.includes('wamid.accounting-failure'))
  const accountingUpdate = executeCalls.find(call => call.query.includes('UPDATE notifications SET error = ?'))
  assert.ok(accountingUpdate, 'accounting failure must remain visible on the sent notification')
  assert.match(String(accountingUpdate?.params[0]), /WhatsApp delivery sent but credit accounting failed/)
})
