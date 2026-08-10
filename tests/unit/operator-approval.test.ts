import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createOperatorApprovalToken,
  OperatorApprovalError,
  sha256CanonicalJson,
  verifyOperatorApprovalToken,
} from '../../server/utils/operator-approval.ts'

const SECRET = 'operator-approval-test-secret'
const REQUEST = {
  organizationId: 'org-1',
  action: 'manual',
  quantity: 25,
}
const EXPECTED_STATE_SHA256 = 'a'.repeat(64)
const NOW = new Date('2026-08-10T12:00:00.000Z')
const EXPIRES_AT = '2026-08-10T12:10:00.000Z'

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

async function signVersionedToken(version: number): Promise<string> {
  const claims = {
    version,
    purpose: 'quota_adjustment',
    actor: 'operator-1',
    request: REQUEST,
    expectedStateSha256: EXPECTED_STATE_SHA256,
    expiresAt: EXPIRES_AT,
  }
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

function approvalExpectation(overrides: Record<string, unknown> = {}) {
  return {
    purpose: 'quota_adjustment',
    actor: 'operator-1',
    request: REQUEST,
    expectedStateSha256: EXPECTED_STATE_SHA256,
    now: NOW,
    ...overrides,
  }
}

test('operator approval signs and verifies a purpose-bound canonical request', async () => {
  const token = await createOperatorApprovalToken(SECRET, {
    purpose: 'quota_adjustment',
    actor: 'operator-1',
    request: REQUEST,
    expectedStateSha256: EXPECTED_STATE_SHA256,
    expiresAt: EXPIRES_AT,
  })

  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.deepEqual(
    await verifyOperatorApprovalToken(SECRET, token, approvalExpectation()),
    {
      version: 1,
      purpose: 'quota_adjustment',
      actor: 'operator-1',
      request: REQUEST,
      expectedStateSha256: EXPECTED_STATE_SHA256,
      expiresAt: EXPIRES_AT,
    },
  )
})

test('operator approval rejects cross-purpose, actor, request, state, and expiry mismatches', async () => {
  const token = await createOperatorApprovalToken(SECRET, {
    purpose: 'quota_adjustment',
    actor: 'operator-1',
    request: REQUEST,
    expectedStateSha256: EXPECTED_STATE_SHA256,
    expiresAt: EXPIRES_AT,
  })

  for (const [label, overrides, code] of [
    ['purpose', { purpose: 'historical_reconciliation' }, 'approval_token_mismatch'],
    ['actor', { actor: 'operator-2' }, 'approval_token_mismatch'],
    ['request', { request: { ...REQUEST, quantity: 26 } }, 'approval_token_mismatch'],
    ['state', { expectedStateSha256: 'b'.repeat(64) }, 'approval_state_mismatch'],
    ['expiry', { now: new Date('2026-08-10T22:01:00.000Z') }, 'approval_expired'],
  ] as const) {
    await assert.rejects(
      () => verifyOperatorApprovalToken(SECRET, token, approvalExpectation(overrides)),
      (error: unknown) => error instanceof OperatorApprovalError && error.code === code,
      label,
    )
  }

  const unsupportedVersionToken = await signVersionedToken(2)
  await assert.rejects(
    () => verifyOperatorApprovalToken(SECRET, unsupportedVersionToken, approvalExpectation()),
    (error: unknown) => error instanceof OperatorApprovalError
      && error.code === 'approval_token_invalid'
      && error.message === 'Approval token version is invalid.',
  )
})

test('operator approval rejects tampering, malformed tokens, and an empty secret', async () => {
  const token = await createOperatorApprovalToken(SECRET, {
    purpose: 'quota_adjustment',
    actor: 'operator-1',
    request: REQUEST,
    expectedStateSha256: EXPECTED_STATE_SHA256,
    expiresAt: EXPIRES_AT,
  })

  for (const malformed of [
    `${token.slice(0, -1)}x`,
    'not-a-token',
    'a.b.c',
    '.signature',
  ]) {
    await assert.rejects(
      () => verifyOperatorApprovalToken(SECRET, malformed, approvalExpectation()),
      (error: unknown) => error instanceof OperatorApprovalError && error.code === 'approval_token_invalid',
    )
  }

  await assert.rejects(
    () => createOperatorApprovalToken('', {
      purpose: 'quota_adjustment',
      actor: 'operator-1',
      request: REQUEST,
      expectedStateSha256: EXPECTED_STATE_SHA256,
      expiresAt: EXPIRES_AT,
    }),
    (error: unknown) => error instanceof OperatorApprovalError
      && error.code === 'configuration_error'
      && error.statusCode === 500,
  )

  await assert.rejects(
    () => verifyOperatorApprovalToken('', token, approvalExpectation()),
    (error: unknown) => error instanceof OperatorApprovalError
      && error.code === 'configuration_error'
      && error.statusCode === 500,
  )
})

test('sha256CanonicalJson preserves the quota state digest contract', async () => {
  assert.equal(
    await sha256CanonicalJson({ balance: 125, period: '2026-08-10' }),
    '64ddb5afae1fa427eabeb0141a45a9a277e0b2f7c0aee4b34bb38f713c2f027a',
  )
})
