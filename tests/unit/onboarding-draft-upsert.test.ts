import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const calls: Array<{ query: string; params: unknown[] }> = []

async function queryFirst(_db: unknown, query: string, params: unknown[]) {
  calls.push({ query, params })
  return { id: 'draft-existing' }
}

mock.module('../../server/db/index.ts', {
  exports: { queryFirst },
})

const { buildOnboardingDraftPayload, upsertActiveOnboardingDraft } = await import('../../server/utils/onboarding-drafts.ts')

test('active onboarding draft saves use one atomic partial-index upsert', async () => {
  calls.length = 0
  const payload = buildOnboardingDraftPayload({
    name: 'Test Cafe',
    vertical: 'restaurant',
    place: null,
    details: {
      name: 'Test Cafe',
      city: 'Krabi',
      address: null,
      phone: null,
      websiteUrl: null,
      openingHours: null,
      notificationPhone: null,
      timezone: 'Asia/Bangkok',
      currency: 'THB',
      isPrimary: true,
    },
  })

  const result = await upsertActiveOnboardingDraft({} as D1Database, {
    userId: 'user-1',
    organizationId: 'org-1',
    name: 'Test Cafe',
    vertical: 'restaurant',
    sourceType: 'manual',
    payload,
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0]!.query, /ON CONFLICT\(user_id\) WHERE status = 'active'/)
  assert.match(calls[0]!.query, /DO UPDATE SET[\s\S]*RETURNING id/)
  assert.equal(result.id, 'draft-existing')
})
