import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { checkLegalBudget, legalBudgetKey, validateLegalCallbackUrl } from '../../server/utils/legal-access.ts'

// R19: the four public budgets (IP/site/op, actor/site/op, site/op
// aggregate, request-reference) are independent and fail closed. This is
// proven against real local D1 (testing-strategy.md item 3 — "persistence,
// transactions, and atomicity") rather than a fake limiter, per this task's
// brief: "D1 limiter failure denies the request instead of bypassing the
// limit" and "rotating ... each hit their own budget" both need a real
// rate_limits table, not a mock.
test('checkLegalBudget: real D1 rate_limits table proves independence and fail-closed behavior', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'legal-access-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))

    const envWithBudget = (limit: string, windowMs: string) => ({
      LEGAL_PUBLIC_BUDGET_IP_SITE_OP_LIMIT: limit,
      LEGAL_PUBLIC_BUDGET_IP_SITE_OP_WINDOW_MS: windowMs,
    } as unknown as CloudflareEnv)

    // Missing/invalid config denies without ever touching D1 (no row is
    // written for a key that was never even attempted).
    await checkLegalBudget(db, {} as CloudflareEnv, 'ip_site_op', legalBudgetKey('practice_read', ['ip', 'unconfigured', 'site-1']))
      .then(ok => assert.equal(ok, false))
    assert.equal(await db.prepare("SELECT count(*) FROM rate_limits WHERE key = ?").bind(legalBudgetKey('practice_read', ['ip', 'unconfigured', 'site-1'])).first('count(*)'), 0)

    const invalidEnv = { LEGAL_PUBLIC_BUDGET_IP_SITE_OP_LIMIT: 'not-a-number', LEGAL_PUBLIC_BUDGET_IP_SITE_OP_WINDOW_MS: '60000' } as unknown as CloudflareEnv
    assert.equal(await checkLegalBudget(db, invalidEnv, 'ip_site_op', legalBudgetKey('practice_read', ['ip', 'bad-config', 'site-1'])), false)

    // A real limit of 2 within a real window: two requests pass, the third
    // (same key) is denied — proves the increment/limit boundary against a
    // real rate_limits row, not a stubbed count.
    const budgetEnv = envWithBudget('2', '3600000')
    const key = legalBudgetKey('intake_without_payment', ['ip', 'ip-hash-a', 'site-1'])
    assert.equal(await checkLegalBudget(db, budgetEnv, 'ip_site_op', key), true)
    assert.equal(await checkLegalBudget(db, budgetEnv, 'ip_site_op', key), true)
    assert.equal(await checkLegalBudget(db, budgetEnv, 'ip_site_op', key), false)
    assert.equal(await db.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first('count'), 3)

    // Rotating the IP for the same actor/site/operation is a different key
    // and gets its own fresh budget — proves the four-dimension key scheme
    // isolates rotated identifiers instead of sharing one bucket.
    const rotatedIpKey = legalBudgetKey('intake_without_payment', ['ip', 'ip-hash-b', 'site-1'])
    assert.equal(await checkLegalBudget(db, budgetEnv, 'ip_site_op', rotatedIpKey), true)

    // Rotating the actor id for one IP (a distinct budget dimension: actor
    // vs. IP) is likewise independent of the IP budget above, even though
    // both are already saturated/near-saturated for their own key.
    const actorEnv = { LEGAL_PUBLIC_BUDGET_ACTOR_SITE_OP_LIMIT: '2', LEGAL_PUBLIC_BUDGET_ACTOR_SITE_OP_WINDOW_MS: '3600000' } as unknown as CloudflareEnv
    const actorKeyOne = legalBudgetKey('intake_without_payment', ['actor', 'actor-1', 'site-1'])
    const actorKeyTwo = legalBudgetKey('intake_without_payment', ['actor', 'actor-2', 'site-1'])
    assert.equal(await checkLegalBudget(db, actorEnv, 'actor_site_op', actorKeyOne), true)
    assert.equal(await checkLegalBudget(db, actorEnv, 'actor_site_op', actorKeyTwo), true)

    // Site-wide aggregate budget saturates independently of any single
    // actor/IP budget above.
    const siteEnv = { LEGAL_PUBLIC_BUDGET_SITE_OP_LIMIT: '1', LEGAL_PUBLIC_BUDGET_SITE_OP_WINDOW_MS: '3600000' } as unknown as CloudflareEnv
    const siteKey = legalBudgetKey('intake_without_payment', ['site', 'site-1'])
    assert.equal(await checkLegalBudget(db, siteEnv, 'site_op', siteKey), true)
    assert.equal(await checkLegalBudget(db, siteEnv, 'site_op', siteKey), false)

    // Repeated request-reference follow-up probes hit their own budget,
    // independent of the actor/site/IP budgets above.
    const refEnv = { LEGAL_PUBLIC_BUDGET_REQUEST_REF_LIMIT: '1', LEGAL_PUBLIC_BUDGET_REQUEST_REF_WINDOW_MS: '3600000' } as unknown as CloudflareEnv
    const refKey = legalBudgetKey('intake_without_payment', ['ref', 'request-ref-uuid'])
    assert.equal(await checkLegalBudget(db, refEnv, 'request_ref', refKey), true)
    assert.equal(await checkLegalBudget(db, refEnv, 'request_ref', refKey), false)

    // D1 limiter failure denies rather than bypassing the limit: drop the
    // rate_limits table out from under a validly configured budget and
    // confirm the thrown write error is caught and treated as a denial, not
    // an unhandled 500.
    await db.prepare('DROP TABLE rate_limits').run()
    assert.equal(await checkLegalBudget(db, budgetEnv, 'ip_site_op', legalBudgetKey('practice_read', ['ip', 'ip-hash-c', 'site-1'])), false)
  } finally { await runtime.dispose() }
})

// Whole-branch-review finding I3: R22 requires the Connect callback URLs be
// built from "exact per-environment HTTPS return and refresh settings," but
// server/api/dashboard/legal/connect/index.post.ts previously only checked
// for a non-empty string before forwarding LEGAL_BLAWBY_CALLBACK_URL_RETURN/
// LEGAL_BLAWBY_CALLBACK_URL_REFRESH to Blawby -- no HTTPS check, no
// userinfo/fragment rejection anywhere. validateLegalCallbackUrl is a pure
// function (no D1/session/network) -- placed in this uncapped D1-suite file
// (rather than tests/unit/, which is at its 3600-line cap with zero margin)
// purely for test-quality-cap headroom, same reasoning legal-access-d1.test.ts
// and legal-entitlement-rollout-matrix-d1.test.ts already document for their
// own D1-backed proofs.
test('validateLegalCallbackUrl: R22 exact-HTTPS validation for the Connect callback URLs (pure function, no D1)', () => {
  // A valid HTTPS URL passes and is returned normalized.
  assert.equal(validateLegalCallbackUrl('https://dashboard.example.com/legal/connect/return'), 'https://dashboard.example.com/legal/connect/return')

  // http:// fails -- R22 requires HTTPS.
  assert.equal(validateLegalCallbackUrl('http://dashboard.example.com/legal/connect/return'), null)

  // A URL with userinfo fails.
  assert.equal(validateLegalCallbackUrl('https://user:pass@dashboard.example.com/legal/connect/return'), null)
  assert.equal(validateLegalCallbackUrl('https://user@dashboard.example.com/legal/connect/return'), null)

  // A URL with a fragment fails.
  assert.equal(validateLegalCallbackUrl('https://dashboard.example.com/legal/connect/return#section'), null)

  // An empty or missing value fails.
  assert.equal(validateLegalCallbackUrl(''), null)

  // A malformed URL fails.
  assert.equal(validateLegalCallbackUrl('not a url'), null)

  // A non-HTTP(S) scheme fails.
  assert.equal(validateLegalCallbackUrl('ftp://dashboard.example.com/legal/connect/return'), null)
})
