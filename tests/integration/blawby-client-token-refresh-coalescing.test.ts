import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CloudflareEnv } from '../../server/utils/auth'
import { callBlawbyRoute } from '../../server/utils/blawby-client'

// U9 reconciliation (task-u8-reconciliation-brief.md section 5b): proves the
// fix to getCachedOrFreshToken's forced-refresh coalescing. The old
// ordering deleted (and forgot) any cached entry whenever forceRefresh was
// true WITHOUT first checking entry.inflight, so two callers hitting U8's
// machine-auth discriminator (invalid_token) for the same scope in the same
// tick would each delete the other's just-registered inflight refresh and
// start a duplicate token exchange -- exactly the coalescing R3 requires
// ("only U8's stable machine-auth discriminator may clear and refresh the
// token once") but did not actually provide under this race.
//
// Same globalThis.fetch-stubbing technique as tests/unit/blawby-client.test.ts
// (this repo's no-internal-mocking rule: only the real fetch boundary is
// stubbed, nothing inside blawby-client.ts itself). Lives in
// tests/integration/ rather than tests/unit/ because tests/unit/ is
// currently at check-unit-test-quality.mjs's file/line caps (42
// files/3600 lines) -- this directory is outside those caps, same reasoning
// legal-entitlement-rollout-matrix-d1.test.ts documents for itself.

function makeEnv(overrides: Partial<CloudflareEnv> = {}): CloudflareEnv {
  return {
    LEGAL_BLAWBY_ORIGIN: 'https://blawby.example',
    LEGAL_BLAWBY_CLIENT_ID: 'client-id',
    LEGAL_BLAWBY_CLIENT_SECRET: 'client-secret',
    LEGAL_BLAWBY_AUDIENCE: 'urn:blawby:legal-api',
    LEGAL_BLAWBY_TIMEOUT_MS: '5000',
    ...overrides,
  } as unknown as CloudflareEnv
}

const tokenResponse = (): Response =>
  Response.json({ access_token: `tok-${Math.random().toString(36).slice(2)}`, expires_in: 300, token_type: 'Bearer' })

// U8's real machine-auth-discriminator 401 shape (task-u8-reconciliation-brief.md
// section 1): `error` is an OBJECT with a `code` field, not a plain string.
const invalidTokenResponse = (): Response =>
  new Response(JSON.stringify({ error: { code: 'invalid_token', message: 'stale' } }), {
    status: 401,
    headers: { 'www-authenticate': 'Bearer realm="krabiclaw-facade", error="invalid_token"' },
  })

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch
  return () => { globalThis.fetch = original }
}

const identity = { organizationId: 'org_1', actorId: 'actor_1', actorKind: 'human' }

test('forced (invalid_token-discriminated) token refresh coalesces two same-tick callers for the same scope into exactly one fresh exchange', { timeout: 30_000 }, async () => {
  let tokenExchanges = 0
  const restore = stubFetch((url) => {
    if (url.includes('/oauth2/token')) {
      tokenExchanges += 1
      return tokenResponse()
    }
    // Every real-route call is a machine-auth failure -- both concurrent
    // callers observe a stale token on their first attempt AND on their
    // forced-refresh replay, so BOTH the initial coalescing (already
    // proven elsewhere) and the forced-refresh coalescing this test targets
    // are exercised.
    return invalidTokenResponse()
  })

  try {
    const env = makeEnv()
    const call = () => callBlawbyRoute(env, {
      routeKey: 'practiceRead',
      scope: 'legal:test-force-coalesce',
      method: 'GET',
      identity,
      correlationId: 'corr-force',
      parseResponse: (body: unknown) => body,
    })

    const results = await Promise.allSettled([call(), call()])
    // Both calls ultimately fail (route never stops returning invalid_token)
    // -- that is expected and irrelevant to this test; what matters is how
    // many REAL token exchanges happened underneath.
    for (const result of results) assert.equal(result.status, 'rejected')

    // Exactly two real exchanges total: one coalesced initial exchange
    // (both callers share the same first inflight token fetch, already
    // proven by tests/unit/blawby-client.test.ts) plus one coalesced FORCED
    // exchange (this task's fix) — never four, which is what the old
    // delete-before-checking-inflight ordering would have produced (each
    // caller separately deleting and reissuing on both rounds).
    assert.equal(tokenExchanges, 2)
  } finally {
    restore()
  }
})
