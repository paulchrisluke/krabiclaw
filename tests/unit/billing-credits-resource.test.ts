import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => [],
    queryFirst: async () => null,
    queryAll: async () => [],
    createDb: () => ({}),
    schema: {},
  },
})

const {
  groupUsageEvents,
  parseUsageEventRow,
} = await import('../../server/utils/ai-credits.ts')
const { getAiCreditsDisplayState, validateAiCreditsResponse } = await import('../../composables/useAiCredits.ts')

test('canonical usage rows expose only safe metadata and preserve uncharged quantity', () => {
  const row = parseUsageEventRow({
    resource: 'maps_api',
    site_id: 'site-1',
    site_name: 'Demo',
    quantity: 3,
    metadata_json: JSON.stringify({
      action: 'google_places_details',
      charged: false,
      model: 'provider-secret',
      inputTokens: 999,
    }),
    created_at: '2026-08-10T12:00:00.000Z',
  })

  assert.deepEqual(row, {
    resource: 'maps_api',
    site_id: 'site-1',
    site_name: 'Demo',
    action: 'google_places_details',
    quantity: 3,
    charged: false,
    created_at: '2026-08-10T12:00:00.000Z',
  })
})

test('usage grouping is sourced from canonical rows and keeps charged state distinct', () => {
  const rows = [
    parseUsageEventRow({
      resource: 'ai_inference',
      site_id: 'site-1',
      site_name: 'Demo',
      quantity: 2,
      metadata_json: JSON.stringify({ action: 'chowbot', charged: true }),
      created_at: '2026-08-10T12:00:00.000Z',
    }),
    parseUsageEventRow({
      resource: 'ai_inference',
      site_id: 'site-1',
      site_name: 'Demo',
      quantity: 5,
      metadata_json: JSON.stringify({ action: 'chowbot', charged: false }),
      created_at: '2026-08-10T13:00:00.000Z',
    }),
  ]

  assert.deepEqual(groupUsageEvents(rows), [
    { resource: 'ai_inference', action: 'chowbot', charged: false, quantity: 5, calls: 1 },
    { resource: 'ai_inference', action: 'chowbot', charged: true, quantity: 2, calls: 1 },
  ])
})

test('malformed canonical quantities fail closed instead of becoming zero usage', () => {
  assert.throws(
    () => parseUsageEventRow({
      resource: 'ai_inference',
      site_id: null,
      site_name: null,
      quantity: Number.NaN,
      metadata_json: null,
      created_at: '2026-08-10T12:00:00.000Z',
    }),
    /Invalid canonical usage quantity/,
  )
})

test('malformed optional metadata leaves canonical quantity and event visible', () => {
  const event = parseUsageEventRow({
    resource: 'messaging',
    site_id: null,
    site_name: null,
    quantity: 2,
    metadata_json: '{not-json',
    created_at: '2026-08-10T12:00:00.000Z',
  })
  assert.deepEqual(event, {
    resource: 'messaging',
    site_id: null,
    site_name: null,
    action: null,
    quantity: 2,
    charged: null,
    created_at: '2026-08-10T12:00:00.000Z',
  })
  assert.deepEqual(groupUsageEvents([event]), [{
    resource: 'messaging',
    action: null,
    charged: null,
    quantity: 2,
    calls: 1,
  }])
})

test('client quota shape requires recurring period fields', () => {
  const valid = {
    plan: 'growth',
    planAllowance: 2000,
    periodAllowance: 2000,
    periodUsed: 12,
    periodRemaining: 1988,
    periodStart: '2026-08-10T00:00:00.000Z',
    periodEnd: '2026-08-17T00:00:00.000Z',
    lifetimeUsed: 102,
    perChatCap: 500,
    sessionUsed: 12,
    sessionRemaining: 488,
    unlimited: false,
    reconciliationRequired: false,
  }
  assert.equal(validateAiCreditsResponse(valid), true)
  assert.equal('total' in valid, false)
  assert.equal(validateAiCreditsResponse({ ...valid, periodRemaining: '1988' }), false)
})

test('quota display state never treats reconciliation as unlimited or depleted', () => {
  assert.equal(getAiCreditsDisplayState({
    unlimited: false,
    periodRemaining: 0,
    reconciliationRequired: true,
  }), 'reconciliation')
  assert.equal(getAiCreditsDisplayState({
    unlimited: true,
    periodRemaining: null,
    reconciliationRequired: false,
  }), 'unlimited')
  assert.equal(getAiCreditsDisplayState({
    unlimited: false,
    periodRemaining: 497,
    reconciliationRequired: false,
  }), 'finite')
})
