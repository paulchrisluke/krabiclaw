import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'
import { validateLegalPaymentUrl } from '../../server/utils/legal-access.ts'
import { buildBlawbyIntakeCreateBody, validateLegalIntakePayload } from '../../server/utils/legal-intake-payload.ts'
import { claimLegalIntakeReference, findLegalIntakeReferenceForActor } from '../../server/utils/legal-intake-references.ts'

// U6: proves the two genuinely new pieces this task adds (R15's
// create-intake payload validator, R30's Stripe payment-URL allowlist
// check) plus the new read-only repository lookup
// (findLegalIntakeReferenceForActor) that server/api/public/sites/[siteId]/
// legal/intakes/{recover,checkout,status,post-pay}.post.ts all wire
// request->repository calls through.
//
// Per this task's brief: session/actor scenarios (missing session,
// cross-actor via a real Better Auth anonymous session) need a real
// anonymous Better Auth session fixture, and none exists anywhere under
// tests/integration/ or tests/unit/ (grepped for `isAnonymous`/`anonymous`
// across both directories before writing this file) -- that gap is
// deferred to U7 explicitly, same as U5 deferred its own session-fixture
// gap, rather than inventing a new harness here. Route-level
// site/origin/entitlement/flag/IP-budget denial scenarios are already
// proven by U3's own tests (tests/unit/legal-access.test.ts,
// tests/integration/legal-access-d1.test.ts) and are not re-proven here.
// Full-route (defineHandler) invocation has no precedent anywhere in this
// repo's test suite (grepped for H3Event/mockEvent/createEvent construction
// across tests/) -- every existing legal test proves the underlying
// exported functions directly rather than simulating H3 dispatch, so this
// file follows that same established boundary rather than inventing a new
// H3Event-mocking harness.
//
// The payload/URL-validator tests below are PURE functions needing no D1
// at all, but this task's tests/unit/ suite was already at its exact
// caps (42/42 files, 3600/3600 lines) before this task started (confirmed
// via `yarn lint:test-quality`) -- there was zero headroom for even one
// new line, let alone a new file, so every new U6 test (pure or
// D1-backed) is filed here instead, following the same "spend none of
// that scarce, already-exhausted budget" reasoning
// legal-intake-references-d1.test.ts already documents for the same
// situation in U4.

test('validateLegalIntakePayload: allowlisted-field shape enforcement (R15)', async () => {
  const valid = {
    matterType: 'Contract dispute',
    fullName: 'Jane Doe',
    email: '  Jane.Doe@Example.COM  ',
    phone: '  555-0100  ',
    description: 'Needs help reviewing a signed lease.',
  }
  const result = validateLegalIntakePayload(valid)
  assert.deepEqual(result, {
    matterType: 'Contract dispute',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '555-0100',
    description: 'Needs help reviewing a signed lease.',
  })

  // phone is the only nullable/optional field.
  const { phone: _phone, ...withoutPhone } = valid
  const resultWithoutPhone = validateLegalIntakePayload(withoutPhone)
  assert.equal(resultWithoutPhone?.phone, null)

  // Every other field is required.
  for (const missingField of ['matterType', 'fullName', 'email', 'description']) {
    const { [missingField]: _omit, ...rest } = valid
    assert.equal(validateLegalIntakePayload(rest), undefined, `missing ${missingField} should fail closed`)
  }

  // An unknown field is rejected outright, not silently dropped.
  assert.equal(validateLegalIntakePayload({ ...valid, unexpectedField: 'x' }), undefined)

  // A malformed email fails closed.
  assert.equal(validateLegalIntakePayload({ ...valid, email: 'not-an-email' }), undefined)

  // A non-object payload (array, string, null, undefined) fails closed.
  assert.equal(validateLegalIntakePayload(['not', 'an', 'object']), undefined)
  assert.equal(validateLegalIntakePayload('a string'), undefined)
  assert.equal(validateLegalIntakePayload(null), undefined)
  assert.equal(validateLegalIntakePayload(undefined), undefined)

  // Over-length required and optional fields both fail closed. email/description
  // bounds match Blawby's real createPracticeClientIntakeSchema (email max 255,
  // description max 500) now that R15's judgment call has been reconciled
  // against the confirmed U8 contract -- an over-bound value here would
  // otherwise sail past this validator only to be rejected by Blawby's own
  // schema later, surfacing as an opaque 502 instead of this route's own 400.
  assert.equal(validateLegalIntakePayload({ ...valid, matterType: 'x'.repeat(201) }), undefined)
  assert.equal(validateLegalIntakePayload({ ...valid, email: `${'x'.repeat(250)}@example.com` }), undefined)
  assert.equal(validateLegalIntakePayload({ ...valid, description: 'x'.repeat(501) }), undefined)
})

test('buildBlawbyIntakeCreateBody: maps the browser-facing shape onto Blawby\'s real create-intake contract', async () => {
  // Blawby's createPracticeClientIntakeSchema requires {amount, name, email},
  // not {matterType, fullName} -- see
  // src/modules/practice-client-intakes/validations/practice-client-intakes.validation.ts
  // in blawby-ts. This is a free (no-payment) intake, so amount is always 0;
  // matterType has no first-class Blawby field, so it rides in custom_fields.
  const payload = validateLegalIntakePayload({
    matterType: 'Contract dispute',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '555-0100',
    description: 'Needs help reviewing a signed lease.',
  })
  assert.ok(payload)

  assert.deepEqual(buildBlawbyIntakeCreateBody(payload), {
    amount: 0,
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '555-0100',
    description: 'Needs help reviewing a signed lease.',
    custom_fields: { matter_type: 'Contract dispute' },
  })

  // A null phone (Krabi's only optional field) is omitted rather than sent
  // as null -- Blawby's `phone` is an optional string, not nullable.
  const withoutPhone = validateLegalIntakePayload({
    matterType: 'Contract dispute',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    description: 'Needs help reviewing a signed lease.',
  })
  assert.ok(withoutPhone)
  assert.equal('phone' in buildBlawbyIntakeCreateBody(withoutPhone), false)
})

test('validateLegalPaymentUrl: HTTPS + exact-origin allowlist + userinfo rejection (R30)', async () => {
  const allowlist = new Set(['https://checkout.stripe.com'])

  // A trusted origin passes through, normalized.
  assert.equal(validateLegalPaymentUrl('https://checkout.stripe.com/pay/cs_123', allowlist), 'https://checkout.stripe.com/pay/cs_123')

  // Non-HTTPS is rejected.
  assert.equal(validateLegalPaymentUrl('http://checkout.stripe.com/pay/cs_123', allowlist), null)

  // Wrong origin (including a sibling-looking or subdomain-prefixed host) is rejected.
  assert.equal(validateLegalPaymentUrl('https://evil.example.com/pay/cs_123', allowlist), null)
  assert.equal(validateLegalPaymentUrl('https://checkout.stripe.com.evil.example.com/pay/cs_123', allowlist), null)

  // Userinfo in the URL is rejected even against an otherwise-trusted origin.
  assert.equal(validateLegalPaymentUrl('https://user:pass@checkout.stripe.com/pay/cs_123', allowlist), null)

  // A malformed URL fails closed rather than throwing.
  assert.equal(validateLegalPaymentUrl('not a url', allowlist), null)

  // The default export allowlist covers both PLACEHOLDER candidate hosts
  // flagged in the U6 report.
  assert.ok(validateLegalPaymentUrl('https://checkout.stripe.com/pay/cs_123') !== null)
  assert.ok(validateLegalPaymentUrl('https://buy.stripe.com/pay/cs_123') !== null)
})

test('findLegalIntakeReferenceForActor: real-D1 ownership rule for the recover/checkout/status/post-pay lookup path', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'legal-intake-public-routes-proof', type: 'worker', compatibilityDate: '2024-11-01',
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
    ].map(statement => db.prepare(statement)))

    const env = { LEGAL_DIGEST_KEY_ACTIVE: 'k1:active-secret' } as unknown as CloudflareEnv
    const headers = new Map<string, string>()
    const event = { req: { headers: { get: (key: string) => headers.get(key) ?? null } } } as unknown as Parameters<typeof claimLegalIntakeReference>[1]

    const claim = await claimLegalIntakeReference(db, event, env, {
      requestReference: 'lookup-ref-a', organizationId: 'org-a', siteId: 'site-a',
      actorId: 'actor-a', actorKind: 'anonymous', payload: { matter: 'Contract dispute' },
    })
    assert.equal(claim.status, 'claimed')

    // The original actor can look their own record up.
    const foundByOwner = await findLegalIntakeReferenceForActor(db, {
      requestReference: 'lookup-ref-a', organizationId: 'org-a', siteId: 'site-a', actorId: 'actor-a',
    })
    assert.ok(foundByOwner)
    assert.equal(foundByOwner?.id, 'lookup-ref-a')
    assert.equal(foundByOwner?.blawbyIntakeId, null)

    // A different actor cannot -- "not found" and "not owned" are
    // indistinguishable (both return null), so this can't be used to probe
    // whether a reference exists at all.
    assert.equal(await findLegalIntakeReferenceForActor(db, {
      requestReference: 'lookup-ref-a', organizationId: 'org-a', siteId: 'site-a', actorId: 'actor-b',
    }), null)

    // Cross-site and cross-org lookups (even by the true owner's actor id)
    // are also denied -- the WHERE clause scopes by org+site, not actor id
    // alone.
    assert.equal(await findLegalIntakeReferenceForActor(db, {
      requestReference: 'lookup-ref-a', organizationId: 'org-a', siteId: 'site-b', actorId: 'actor-a',
    }), null)
    assert.equal(await findLegalIntakeReferenceForActor(db, {
      requestReference: 'lookup-ref-a', organizationId: 'org-b', siteId: 'site-a', actorId: 'actor-a',
    }), null)

    // A genuinely nonexistent reference is also null, not an error.
    assert.equal(await findLegalIntakeReferenceForActor(db, {
      requestReference: 'no-such-ref', organizationId: 'org-a', siteId: 'site-a', actorId: 'actor-a',
    }), null)

    // After the trusted link hook runs (R27, already proven by U4's own
    // test), the linked current authorized user can look the record up too
    // -- the only cross-actor continuation R16 allows.
    await db.prepare("UPDATE legal_intake_references SET current_authorized_user_id = 'human-x' WHERE id = 'lookup-ref-a'").run()
    const foundByLinkedUser = await findLegalIntakeReferenceForActor(db, {
      requestReference: 'lookup-ref-a', organizationId: 'org-a', siteId: 'site-a', actorId: 'human-x',
    })
    assert.ok(foundByLinkedUser)
    assert.equal(foundByLinkedUser?.originalActorId, 'actor-a')
  } finally {
    clearTimeout(deadline)
    await runtime.dispose()
  }
})
