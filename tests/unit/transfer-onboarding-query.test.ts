import assert from 'node:assert/strict'
import test from 'node:test'

import { parseTransferOnboardingQuery } from '../../shared/transfer-onboarding-query.ts'

test('transfer query parser distinguishes absent, exact, and invalid scopes', () => {
  assert.deepEqual(parseTransferOnboardingQuery({}), { kind: 'legacy' })
  assert.deepEqual(
    parseTransferOnboardingQuery({ transfer: 'transfer-exact' }),
    { kind: 'exact', transferId: 'transfer-exact' },
  )

  for (const query of [
    { transfer: '' },
    { transfer: '   \t\n' },
    { transfer: ' transfer-exact' },
    { transfer: 'transfer-exact ' },
    { transfer: ['transfer-exact'] },
    { transfer: ['transfer-exact', 'transfer-other'] },
    { transfer: null },
    { transfer: 42 },
    { transfer: {} },
    [],
  ]) {
    const result = parseTransferOnboardingQuery(query)
    assert.equal(result.kind, 'invalid')
    if (result.kind === 'invalid') {
      assert.equal(result.message, 'The transfer query parameter is invalid.')
    }
  }
})

test('transfer query parser does not treat an inherited transfer value as a query key', () => {
  const query = Object.create({ transfer: 'inherited-transfer' }) as Record<string, unknown>
  assert.deepEqual(parseTransferOnboardingQuery(query), { kind: 'legacy' })
})
