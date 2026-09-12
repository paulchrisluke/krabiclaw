import assert from 'node:assert/strict'
import test from 'node:test'
import type { CloudflareEnv } from '../../server/utils/auth'
import {
  assertLegalStaffMutationOrigin, emitLegalSecurityEvent, isLegalOperationEnabled, legalBudgetKey,
  legalJsonResponse, parseLegalBudgetPositiveInt, resolveLegalDashboardOrigin, resolveLegalPublicActor,
  validateLegalMutationOrigin, type LegalOperation } from '../../server/utils/legal-access'
// Few top-level test(), many t.test() subtests (only test()/it() count, see blawby-client.test.ts).

test('rollout-group flags and R19 budget config/key logic are independent and fail closed', async (t) => {
  const flagCases: Array<[LegalOperation, string]> = [
    ['practice_read', 'LEGAL_PRACTICE_READ_ENABLED'],
    ['practice_mutation', 'LEGAL_PRACTICE_MUTATION_ENABLED'],
    ['connect', 'LEGAL_CONNECT_ENABLED'],
    ['intake_without_payment', 'LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED'],
    ['intake_payment', 'LEGAL_INTAKE_PAYMENT_ENABLED'],
    ['engagement', 'LEGAL_ENGAGEMENT_ENABLED'],
  ]
  await t.test('each of the six operations reads only its own flag, never another', () => {
    for (const [operation, envKey] of flagCases) {
      assert.equal(isLegalOperationEnabled({ [envKey]: 'true' } as unknown as CloudflareEnv, operation), true)
      assert.equal(isLegalOperationEnabled({} as CloudflareEnv, operation), false)
      const otherFlagsOn = Object.fromEntries(flagCases.filter(([, k]) => k !== envKey).map(([, k]) => [k, 'true'])) as unknown as CloudflareEnv
      assert.equal(isLegalOperationEnabled(otherFlagsOn, operation), false)
    }
  })

  await t.test('a missing, non-integer, zero, or negative budget value denies (never a hardcoded fallback)', () => {
    assert.equal(parseLegalBudgetPositiveInt('10'), 10)
    for (const invalid of [undefined, null, '', '0', '-5', '3.5', 'nope', 10]) {
      assert.equal(parseLegalBudgetPositiveInt(invalid), null)
    }
  })

  await t.test('legalBudgetKey isolates each operation/dimension so rotated IPs/actors never share a bucket', () => {
    assert.equal(legalBudgetKey('intake_without_payment', ['ip', 'hash-a', 'site-1']), 'legal:intake_without_payment:ip:hash-a:site-1')
    assert.notEqual(legalBudgetKey('intake_without_payment', ['ip', 'hash-a', 'site-1']), legalBudgetKey('intake_without_payment', ['ip', 'hash-b', 'site-1']))
    assert.notEqual(legalBudgetKey('practice_read', ['actor', 'a1', 'site-1']), legalBudgetKey('connect', ['actor', 'a1', 'site-1']))
  })
})

test('public actor kind derives from Better Auth isAnonymous, never a parallel guest identity model', async (t) => {
  type Session = Parameters<typeof resolveLegalPublicActor>[0]
  await t.test('verified human and anonymous sessions produce distinct actor kinds', () => {
    assert.deepEqual(resolveLegalPublicActor({ user: { id: 'u1', isAnonymous: false } } as unknown as Session), { actorId: 'u1', actorKind: 'human' })
    assert.deepEqual(resolveLegalPublicActor({ user: { id: 'a1', isAnonymous: true } } as unknown as Session), { actorId: 'a1', actorKind: 'anonymous' })
    assert.deepEqual(resolveLegalPublicActor({ user: { id: 'u2' } } as unknown as Session), { actorId: 'u2', actorKind: 'human' })
  })
  await t.test('a missing session or one with no verified user id resolves to no actor', () => {
    assert.equal(resolveLegalPublicActor(null), null)
    assert.equal(resolveLegalPublicActor({ user: {} } as unknown as Session), null)
    assert.equal(resolveLegalPublicActor({ user: { isAnonymous: true } } as unknown as Session), null)
  })
})

test('R13/R26 origin validation and R29 security-event redaction', async (t) => {
  const canonicalOrigin = 'https://client-site.example'
  const eventWithOrigin = (origin?: string) => {
    const map = new Map(origin === undefined ? [] : [['origin', origin]])
    return { req: { headers: { get: (key: string) => map.get(key) ?? null } } } as unknown as Parameters<typeof validateLegalMutationOrigin>[0]
  }
  await t.test('only the site\'s own canonical origin (scheme + host) validates', () => {
    assert.equal(validateLegalMutationOrigin(eventWithOrigin('https://client-site.example'), canonicalOrigin), true)
    assert.equal(validateLegalMutationOrigin(eventWithOrigin('https://client-site.example/'), canonicalOrigin), true)
    assert.equal(validateLegalMutationOrigin(eventWithOrigin('https://attacker.example'), canonicalOrigin), false)
    assert.equal(validateLegalMutationOrigin(eventWithOrigin('http://client-site.example'), canonicalOrigin), false)
    assert.equal(validateLegalMutationOrigin(eventWithOrigin(), canonicalOrigin), false)
    assert.equal(validateLegalMutationOrigin(eventWithOrigin('not a url'), canonicalOrigin), false)
  })

  await t.test('U5: resolveLegalDashboardOrigin/legalJsonResponse/assertLegalStaffMutationOrigin', () => {
    assert.equal(resolveLegalDashboardOrigin({ NUXT_PUBLIC_PLATFORM_DOMAIN: 'dashboard.example' } as unknown as CloudflareEnv), 'https://dashboard.example')
    assert.equal(resolveLegalDashboardOrigin({} as CloudflareEnv), null)
    assert.equal(legalJsonResponse({ ok: true }).headers.get('cache-control'), 'no-store')
    const dashEnv = { NUXT_PUBLIC_PLATFORM_DOMAIN: 'dashboard.example' } as unknown as CloudflareEnv
    assert.throws(() => assertLegalStaffMutationOrigin(eventWithOrigin('https://attacker.example'), dashEnv))
    assert.throws(() => assertLegalStaffMutationOrigin(eventWithOrigin(), {} as CloudflareEnv)); assertLegalStaffMutationOrigin(eventWithOrigin('https://dashboard.example'), dashEnv)
  })

  await t.test('security events carry only the R29 diagnostic fields, never a token/payload/request-reference/session-id/body', () => {
    const originalLog = console.log
    const lines: string[] = []
    console.log = (line: string) => { lines.push(line) }
    try {
      emitLegalSecurityEvent({ reason: 'entitlement_missing', organizationId: 'org-1', siteId: 'site-1', actorKind: 'human', requestCorrelationId: 'corr-1' })
    } finally {
      console.log = originalLog
    }
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>
    assert.deepEqual(Object.keys(parsed).sort(), ['actorKind', 'event', 'organizationId', 'reason', 'requestCorrelationId', 'siteId', 'ts'])
    assert.equal(parsed.reason, 'entitlement_missing')
    for (const banned of ['token', 'payload', 'requestReference', 'sessionId', 'body']) assert.equal(banned in parsed, false)
  })
})
