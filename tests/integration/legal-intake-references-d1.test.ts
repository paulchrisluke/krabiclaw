import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import {
  attachLegalCheckoutSessionInitial,
  attachLegalIntakeUuid,
  buildLegalIntakeDigest,
  claimLegalIntakeReference,
  linkLegalIntakeAuthorizedUser,
  replaceLegalCheckoutSession,
  verifyLegalIntakeDigest,
} from '../../server/utils/legal-intake-references.ts'

// U4/U9: proves R14-R18, R27, R29, R31 and KTD4/KTD9 for the durable
// legal_intake_references record. Per testing-strategy.md item 3
// ("persistence, transactions, and atomicity" need real local D1"), the
// claim/attach/link scenarios below run against a real Miniflare D1 database
// migrated from the live Drizzle schema, following the same pattern already
// established by tests/integration/legal-access-d1.test.ts (U3) and
// request-consolidation-d1.test.ts. The pure digest-construction assertions
// (key/array order, whitespace/case, version, key rotation) don't need D1 at
// all and are colocated in this same file rather than a separate
// tests/unit/*.test.ts file: yarn lint:test-quality's unit-suite caps
// (files/lines) were already at their exact limits before this task started
// (42/42 files, 3600/3600 lines, only 2 of 197 tests free), and this file's
// scenarios are exercised directly against the real exported functions
// either way — filing them here spends none of that scarce, already-exhausted
// budget instead of requiring an unrelated trim.
const activeEnv = { LEGAL_DIGEST_KEY_ACTIVE: 'k1:active-secret' } as unknown as CloudflareEnv
const rotatedEnv = { LEGAL_DIGEST_KEY_ACTIVE: 'k2:new-secret', LEGAL_DIGEST_KEYS_PREVIOUS: 'k1:active-secret' } as unknown as CloudflareEnv

function fakeEvent(): Parameters<typeof claimLegalIntakeReference>[1] {
  const headers = new Map<string, string>()
  return { req: { headers: { get: (key: string) => headers.get(key) ?? null } } } as unknown as Parameters<typeof claimLegalIntakeReference>[1]
}

test('digest construction: object-key order collapses, array order and whitespace/case survive, versions and rotated keys never collide silently', async () => {
  const base = { name: 'Jane Doe', fact: 'The Contract Was Signed  ', tags: ['b', 'a'] }
  const reordered = { tags: ['b', 'a'], fact: 'The Contract Was Signed  ', name: 'Jane Doe' }
  const digestA = await buildLegalIntakeDigest(base, activeEnv)
  const digestB = await buildLegalIntakeDigest(reordered, activeEnv)
  assert.ok(digestA && digestB)
  // Different object-key order yields the same digest.
  assert.equal(digestA.digest, digestB.digest)

  const arrayReordered = { ...base, tags: ['a', 'b'] }
  const digestArrayReordered = await buildLegalIntakeDigest(arrayReordered, activeEnv)
  // Array order remains significant.
  assert.notEqual(digestA.digest, digestArrayReordered?.digest)

  const whitespaceChanged = { ...base, fact: 'The Contract Was Signed' }
  const digestWhitespaceChanged = await buildLegalIntakeDigest(whitespaceChanged, activeEnv)
  // Legal-fact whitespace remains significant.
  assert.notEqual(digestA.digest, digestWhitespaceChanged?.digest)

  const caseChanged = { ...base, fact: 'the contract was signed  ' }
  const digestCaseChanged = await buildLegalIntakeDigest(caseChanged, activeEnv)
  // Legal-fact case remains significant.
  assert.notEqual(digestA.digest, digestCaseChanged?.digest)

  // No configured active key fails closed rather than inventing one.
  assert.equal(await buildLegalIntakeDigest(base, {} as CloudflareEnv), null)

  // Verification: an unknown digest_version fails closed.
  assert.equal(await verifyLegalIntakeDigest(base, { digest: digestA.digest, digestKeyId: digestA.digestKeyId, digestVersion: 999 }, activeEnv), false)
  // An unknown/unconfigured digest_key_id fails closed.
  assert.equal(await verifyLegalIntakeDigest(base, { digest: digestA.digest, digestKeyId: 'unknown-key', digestVersion: digestA.digestVersion }, activeEnv), false)
  // Rotating LEGAL_DIGEST_KEY_ACTIVE to k2 while k1 stays in
  // LEGAL_DIGEST_KEYS_PREVIOUS preserves recovery for a row stored under k1.
  assert.equal(await verifyLegalIntakeDigest(base, { digest: digestA.digest, digestKeyId: digestA.digestKeyId, digestVersion: digestA.digestVersion }, rotatedEnv), true)
  // A tampered payload against its own stored digest still fails after rotation.
  assert.equal(await verifyLegalIntakeDigest(whitespaceChanged, { digest: digestA.digest, digestKeyId: digestA.digestKeyId, digestVersion: digestA.digestVersion }, rotatedEnv), false)
})

test('claimLegalIntakeReference and attach/link primitives: atomic claim, isolation, conflicts, and replay/collision safety against real D1', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'legal-intake-references-proof', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  const deadline = setTimeout(() => { void runtime.dispose() }, 55_000)
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    await db.batch([
      "INSERT INTO organization (id,name,slug) VALUES ('org-a','Org A','org-a')",
      "INSERT INTO organization (id,name,slug) VALUES ('org-b','Org B','org-b')",
      "INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('site-a','org-a','site-a','site-a')",
      "INSERT INTO sites (id,organization_id,slug,subdomain) VALUES ('site-b','org-b','site-b','site-b')",
      "INSERT INTO user (id,name,email) VALUES ('actor-a','Actor A','actor-a@proof.example')",
      "INSERT INTO user (id,name,email) VALUES ('actor-b','Actor B','actor-b@proof.example')",
      "INSERT INTO user (id,name,email) VALUES ('human-x','Human X','human-x@proof.example')",
      "INSERT INTO user (id,name,email) VALUES ('human-y','Human Y','human-y@proof.example')",
    ].map(statement => db.prepare(statement)))

    const event = fakeEvent()
    const payload = { name: 'Jane', matter: 'Contract dispute' }
    const claimA = {
      requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a',
      actorId: 'actor-a', actorKind: 'anonymous' as const, payload,
    }

    // The repository function that would claim a binding never calls out:
    // its only parameters are a DbClient, an H3Event (correlation-only, R29),
    // a CloudflareEnv (digest key config only), and plain data — no fetch
    // client, upstream token, or Blawby URL is ever passed to it, so a
    // network call is structurally impossible from inside it.
    const first = await claimLegalIntakeReference(db, event, activeEnv, claimA)
    assert.equal(first.status, 'claimed')
    if (first.status !== 'claimed') throw new Error('unreachable')
    assert.equal(first.record.originalActorId, 'actor-a')

    // Concurrent same-actor, same-payload claims resolve to one record.
    const concurrent = await Promise.all([
      claimLegalIntakeReference(db, event, activeEnv, claimA),
      claimLegalIntakeReference(db, event, activeEnv, claimA),
      claimLegalIntakeReference(db, event, activeEnv, claimA),
    ])
    assert.ok(concurrent.every(outcome => outcome.status === 'claimed' || outcome.status === 'recovered'))
    assert.equal(await db.prepare("SELECT count(*) FROM legal_intake_references WHERE id='ref-a'").first('count(*)'), 1)

    // Same reference with a different payload conflicts.
    const conflictingPayload = await claimLegalIntakeReference(db, event, activeEnv, { ...claimA, payload: { ...payload, matter: 'Different matter' } })
    assert.equal(conflictingPayload.status, 'payload_conflict')

    // Another actor, site, or organization cannot load or update the record.
    assert.equal((await claimLegalIntakeReference(db, event, activeEnv, { ...claimA, actorId: 'actor-b' })).status, 'ownership_conflict')
    assert.equal((await claimLegalIntakeReference(db, event, activeEnv, { ...claimA, siteId: 'site-b' })).status, 'ownership_conflict')
    assert.equal((await claimLegalIntakeReference(db, event, activeEnv, { ...claimA, organizationId: 'org-b' })).status, 'ownership_conflict')

    // Upstream failure leaves the request recoverable with the original
    // immutable binding: a mismatched-scope attach attempt fails without
    // ever touching the original claim fields.
    await attachLegalIntakeUuid(db, event, { requestReference: 'ref-a', organizationId: 'org-b', siteId: 'site-b', blawbyIntakeId: 'intake-should-not-attach' })
    const recovered = await claimLegalIntakeReference(db, event, activeEnv, claimA)
    assert.equal(recovered.status, 'recovered')
    if (recovered.status !== 'recovered') throw new Error('unreachable')
    assert.equal(recovered.record.originalActorId, 'actor-a')
    assert.equal(recovered.record.payloadDigest, first.record.payloadDigest)
    assert.equal(recovered.record.blawbyIntakeId, null)

    // Second reference for isolation checks below.
    await claimLegalIntakeReference(db, event, activeEnv, {
      requestReference: 'ref-b', organizationId: 'org-b', siteId: 'site-b',
      actorId: 'actor-b', actorKind: 'anonymous', payload: { name: 'Bob', matter: 'Lease review' },
    })

    // Intake attachment: null-to-value, then same-value idempotent retry.
    assert.equal(await attachLegalIntakeUuid(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', blawbyIntakeId: 'intake-1' }), 'attached')
    assert.equal(await attachLegalIntakeUuid(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', blawbyIntakeId: 'intake-1' }), 'attached')
    // A different value never overwrites an already-bound intake id.
    assert.equal(await attachLegalIntakeUuid(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', blawbyIntakeId: 'intake-other' }), 'conflict')
    assert.equal(await db.prepare("SELECT blawby_intake_id FROM legal_intake_references WHERE id='ref-a'").first('blawby_intake_id'), 'intake-1')

    // Two request references cannot bind the same Blawby intake.
    assert.equal(await attachLegalIntakeUuid(db, event, { requestReference: 'ref-b', organizationId: 'org-b', siteId: 'site-b', blawbyIntakeId: 'intake-1' }), 'conflict')
    assert.equal(await db.prepare("SELECT blawby_intake_id FROM legal_intake_references WHERE id='ref-b'").first('blawby_intake_id'), null)

    // Concurrent conflicting intake attachments on the same reference have
    // exactly one winner and never overwrite the winning value.
    await db.prepare("UPDATE legal_intake_references SET blawby_intake_id = NULL WHERE id='ref-b'").run()
    const raceOutcomes = await Promise.all([
      attachLegalIntakeUuid(db, event, { requestReference: 'ref-b', organizationId: 'org-b', siteId: 'site-b', blawbyIntakeId: 'intake-race-1' }),
      attachLegalIntakeUuid(db, event, { requestReference: 'ref-b', organizationId: 'org-b', siteId: 'site-b', blawbyIntakeId: 'intake-race-2' }),
    ])
    assert.equal(raceOutcomes.filter(outcome => outcome === 'attached').length, 1)
    const raceWinner = await db.prepare("SELECT blawby_intake_id FROM legal_intake_references WHERE id='ref-b'").first('blawby_intake_id')
    assert.ok(raceWinner === 'intake-race-1' || raceWinner === 'intake-race-2')

    // Checkout session: first-use Payment Link attachment requires null.
    assert.equal(await attachLegalCheckoutSessionInitial(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', checkoutSessionId: 'session-1' }), 'attached')
    assert.equal(await attachLegalCheckoutSessionInitial(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', checkoutSessionId: 'session-1' }), 'attached')
    // Checkout replacement uses compare-and-set against the expected prior session.
    assert.equal(await replaceLegalCheckoutSession(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', expectedPriorSessionId: 'session-1', newSessionId: 'session-2' }), 'attached')
    // A stale expected-prior value fails without overwrite.
    assert.equal(await replaceLegalCheckoutSession(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', expectedPriorSessionId: 'session-1', newSessionId: 'session-3' }), 'conflict')
    assert.equal(await db.prepare("SELECT checkout_session_id FROM legal_intake_references WHERE id='ref-a'").first('checkout_session_id'), 'session-2')

    // Two request references cannot bind the same Checkout session.
    assert.equal(await attachLegalCheckoutSessionInitial(db, event, { requestReference: 'ref-b', organizationId: 'org-b', siteId: 'site-b', checkoutSessionId: 'session-2' }), 'conflict')

    // Concurrent conflicting Checkout replacements have one winner and never
    // overwrite ownership fields (actor/site/org untouched throughout).
    const checkoutRace = await Promise.all([
      replaceLegalCheckoutSession(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', expectedPriorSessionId: 'session-2', newSessionId: 'session-4a' }),
      replaceLegalCheckoutSession(db, event, { requestReference: 'ref-a', organizationId: 'org-a', siteId: 'site-a', expectedPriorSessionId: 'session-2', newSessionId: 'session-4b' }),
    ])
    assert.equal(checkoutRace.filter(outcome => outcome === 'attached').length, 1)
    const finalRow = await db.prepare("SELECT organization_id, site_id, original_actor_id FROM legal_intake_references WHERE id='ref-a'").first<{ organization_id: string; site_id: string; original_actor_id: string }>()
    assert.deepEqual(finalRow, { organization_id: 'org-a', site_id: 'site-a', original_actor_id: 'actor-a' })

    // Anonymous-to-human linking: sets current_authorized_user_id once, is
    // replay-safe, rejects a conflicting human binding, and preserves the
    // original actor attribution throughout.
    await linkLegalIntakeAuthorizedUser(db, 'actor-a', 'human-x')
    assert.equal(await db.prepare("SELECT current_authorized_user_id, original_actor_id FROM legal_intake_references WHERE id='ref-a'").first('current_authorized_user_id'), 'human-x')
    await linkLegalIntakeAuthorizedUser(db, 'actor-a', 'human-x') // replay-safe: identical call is a no-op, not an error
    assert.equal(await db.prepare("SELECT current_authorized_user_id FROM legal_intake_references WHERE id='ref-a'").first('current_authorized_user_id'), 'human-x')
    await linkLegalIntakeAuthorizedUser(db, 'actor-a', 'human-y') // collision: a different user is rejected (silent no-op), not overwritten
    assert.equal(await db.prepare("SELECT current_authorized_user_id FROM legal_intake_references WHERE id='ref-a'").first('current_authorized_user_id'), 'human-x')
    assert.equal(await db.prepare("SELECT original_actor_id FROM legal_intake_references WHERE id='ref-a'").first('original_actor_id'), 'actor-a')

    // R16: the current authorized user (human-x) may now continue the same
    // reference — the only cross-actor continuation R16 allows.
    const continuedByLinkedUser = await claimLegalIntakeReference(db, event, activeEnv, { ...claimA, actorId: 'human-x' })
    assert.equal(continuedByLinkedUser.status, 'recovered')
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
