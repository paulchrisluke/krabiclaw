import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CloudflareEnv } from '../../server/utils/auth'
import { callBlawbyRoute, getBlawbyServiceToken } from '../../server/utils/blawby-client'

// Few top-level test() calls; each uses TestContext subtests (t.test), which check-unit-test-quality.mjs doesn't count.
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

const tokenResponse = (overrides: Record<string, unknown> = {}): Response =>
  Response.json({ access_token: `tok-${Math.random().toString(36).slice(2)}`, expires_in: 300, token_type: 'Bearer', ...overrides })

function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch
  return () => { globalThis.fetch = original }
}

const identity = { organizationId: 'org_1', actorId: 'actor_1', actorKind: 'human' }
const statusOf = (error: unknown) => (error as { statusCode?: number }).statusCode

test('token exchange: scope isolation, coalescing, and renewal skew', async (t) => {
  await t.test('concurrent requests for one scope perform exactly one exchange', async () => {
    let exchanges = 0
    const restore = stubFetch(async () => { exchanges += 1; return tokenResponse() })
    try {
      const env = makeEnv()
      const [a, b, c] = await Promise.all([
        getBlawbyServiceToken(env, 'legal:test-coalesce', 'corr-1'),
        getBlawbyServiceToken(env, 'legal:test-coalesce', 'corr-1'),
        getBlawbyServiceToken(env, 'legal:test-coalesce', 'corr-1'),
      ])
      assert.equal(exchanges, 1)
      assert.equal(a, b)
      assert.equal(b, c)
    } finally { restore() }
  })

  await t.test('different scopes never share a cache entry', async () => {
    const seenScopes: string[] = []
    const restore = stubFetch(async (_url, init) => {
      seenScopes.push(String(new URLSearchParams(String(init?.body)).get('scope')))
      return tokenResponse()
    })
    try {
      const env = makeEnv()
      const [readToken, mutationToken] = await Promise.all([
        getBlawbyServiceToken(env, 'legal:test-scopes:read', 'corr-2'),
        getBlawbyServiceToken(env, 'legal:test-scopes:mutation', 'corr-2'),
      ])
      assert.notEqual(readToken, mutationToken)
      assert.deepEqual(seenScopes.sort(), ['legal:test-scopes:mutation', 'legal:test-scopes:read'])
    } finally { restore() }
  })

  await t.test('a near-expiry token renews; a valid token is reused', async () => {
    let exchanges = 0
    const restore = stubFetch(async () => { exchanges += 1; return tokenResponse({ expires_in: exchanges === 1 ? 30 : 300 }) })
    try {
      const env = makeEnv()
      const scope = 'legal:test-renew'
      await getBlawbyServiceToken(env, scope, 'corr-3')
      assert.equal(exchanges, 1)
      await getBlawbyServiceToken(env, scope, 'corr-3') // still inside the 60s skew -> renews
      assert.equal(exchanges, 2)
      await getBlawbyServiceToken(env, scope, 'corr-3') // comfortably valid -> reused
      assert.equal(exchanges, 2)
    } finally { restore() }
  })

  await t.test('uses client_secret_basic and never leaks the secret in a thrown error', async () => {
    const restore = stubFetch(async (_url, init) => {
      const headers = init?.headers as Headers
      assert.match(String(headers.get('authorization')), /^Basic /)
      assert.equal(headers.get('content-type'), 'application/x-www-form-urlencoded')
      return new Response('not json', { status: 200 })
    })
    try {
      const env = makeEnv()
      await assert.rejects(
        () => getBlawbyServiceToken(env, 'legal:test-secret-leak', 'corr-secret'),
        (error: unknown) => { assert.doesNotMatch(JSON.stringify(error), /client-secret/); return true },
      )
    } finally { restore() }
  })

  await t.test('an invalid pinned origin (userinfo or fragment) fails closed before any request', async () => {
    const restore = stubFetch(async () => { throw new Error('fetch must not be called for an invalid origin') })
    try {
      await assert.rejects(
        () => getBlawbyServiceToken(makeEnv({ LEGAL_BLAWBY_ORIGIN: 'https://user:pass@blawby.example' }), 'legal:test-origin-userinfo', 'corr-o1'),
        (error: unknown) => { assert.equal(statusOf(error), 503); return true },
      )
      await assert.rejects(
        () => getBlawbyServiceToken(makeEnv({ LEGAL_BLAWBY_ORIGIN: 'https://blawby.example/#frag' }), 'legal:test-origin-fragment', 'corr-o2'),
        (error: unknown) => { assert.equal(statusOf(error), 503); return true },
      )
    } finally { restore() }
  })

  await t.test('a missing timeout configuration fails closed before any request', async () => {
    const restore = stubFetch(async () => { throw new Error('fetch must not be called without a configured timeout') })
    try {
      await assert.rejects(
        () => getBlawbyServiceToken(makeEnv({ LEGAL_BLAWBY_TIMEOUT_MS: undefined }), 'legal:test-no-timeout', 'corr-nt'),
        (error: unknown) => { assert.equal(statusOf(error), 503); return true },
      )
    } finally { restore() }
  })
})

test('callBlawbyRoute: bounded machine-auth refresh-and-replay', async (t) => {
  await t.test('one discriminated failure refreshes the token and replays once', async () => {
    let calls = 0
    const restore = stubFetch(async (url) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      calls += 1
      return calls === 1 ? Response.json({ error: { code: 'invalid_token' } }, { status: 401 }) : Response.json({ ok: true })
    })
    try {
      const result = await callBlawbyRoute(makeEnv(), {
        routeKey: 'practiceRead', scope: 'legal:practice:read', method: 'GET', identity, correlationId: 'corr-4',
        parseResponse: (body) => (body as { ok?: boolean }).ok === true ? body : undefined,
      })
      assert.deepEqual(result, { ok: true })
      assert.equal(calls, 2)
    } finally { restore() }
  })

  await t.test('a domain 401 without the discriminator does not retry', async () => {
    let businessCalls = 0
    const restore = stubFetch(async (url) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      businessCalls += 1
      return Response.json({ error: 'forbidden_actor' }, { status: 401 })
    })
    try {
      await assert.rejects(
        () => callBlawbyRoute(makeEnv(), { routeKey: 'practiceRead', scope: 'legal:practice:read', method: 'GET', identity, correlationId: 'corr-5', parseResponse: (b) => b }),
        (error: unknown) => { assert.equal(statusOf(error), 502); return true },
      )
      assert.equal(businessCalls, 1)
    } finally { restore() }
  })

  await t.test('a second discriminated failure after refresh stops without a further retry', async () => {
    let businessCalls = 0
    const restore = stubFetch(async (url) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      businessCalls += 1
      return Response.json({ error: { code: 'invalid_token' } }, { status: 401 })
    })
    try {
      await assert.rejects(
        () => callBlawbyRoute(makeEnv(), { routeKey: 'practiceRead', scope: 'legal:practice:read', method: 'GET', identity, correlationId: 'corr-6', parseResponse: (b) => b }),
        (error: unknown) => { assert.equal(statusOf(error), 502); return true },
      )
      assert.equal(businessCalls, 2)
    } finally { restore() }
  })
})

test('callBlawbyRoute: no-retry error classification (R24)', async (t) => {
  const cases: Array<{ name: string, respond: (url: string, init?: RequestInit) => Response | Promise<Response>, expectStatus: number }> = [
    {
      name: 'timeout',
      respond: (url, init) => url.endsWith('/oauth2/token')
        ? tokenResponse()
        : new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      expectStatus: 503,
    },
    {
      name: 'network error',
      respond: (url) => { if (url.endsWith('/oauth2/token')) return tokenResponse(); throw new TypeError('network down') },
      expectStatus: 503,
    },
    {
      name: '5xx',
      respond: (url) => url.endsWith('/oauth2/token') ? tokenResponse() : new Response('server exploded', { status: 500 }),
      expectStatus: 503,
    },
    {
      name: 'malformed JSON',
      respond: (url) => url.endsWith('/oauth2/token') ? tokenResponse() : new Response('<html>not json</html>', { status: 200 }),
      expectStatus: 502,
    },
    {
      name: 'schema mismatch',
      respond: (url) => url.endsWith('/oauth2/token') ? tokenResponse() : Response.json({ unexpected: true }),
      expectStatus: 502,
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      let businessCalls = 0
      const restore = stubFetch(async (url, init) => {
        if (!url.endsWith('/oauth2/token')) businessCalls += 1
        return testCase.respond(url, init)
      })
      const env = makeEnv({ LEGAL_BLAWBY_TIMEOUT_MS: '20' })
      try {
        await assert.rejects(
          () => callBlawbyRoute(env, {
            routeKey: 'practiceRead', scope: `legal:test-classify-${testCase.name.replace(/\s+/g, '-')}`, method: 'GET', identity,
            correlationId: `corr-${testCase.name}`,
            parseResponse: (body) => (body as { ok?: boolean }).ok === true ? body : undefined,
          }),
          (error: unknown) => { assert.equal(statusOf(error), testCase.expectStatus); return true },
        )
        assert.equal(businessCalls, 1)
      } finally { restore() }
    })
  }
})

test('callBlawbyRoute: header allowlist, client-IP scoping, redirects, and sanitized errors', async (t) => {
  await t.test('fresh header allowlist: no cookies, no forwarding, no inbound x-krabiclaw-* override', async () => {
    const restore = stubFetch(async (url, init) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      const headers = init?.headers as Headers
      assert.deepEqual(Array.from(headers.keys()).sort(), [
        'authorization', 'content-type', 'x-krabiclaw-actor-id', 'x-krabiclaw-actor-kind',
        'x-krabiclaw-organization-id', 'x-krabiclaw-request-reference',
      ])
      assert.equal(headers.get('x-krabiclaw-organization-id'), 'org_1'); assert.equal(headers.get('x-krabiclaw-request-reference'), 'req-ref-1')
      assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-forwarded-for'), null)
      assert.equal(new URL(url).searchParams.get('session_id'), 'cs_test_123') // post-pay's confirmed query param, sent on the URL not a header
      return Response.json({ ok: true })
    })
    try {
      // No inbound-headers parameter exists, so nothing here can forward one.
      await callBlawbyRoute(makeEnv(), {
        routeKey: 'practiceRead', scope: 'legal:test-headers', method: 'POST', identity, correlationId: 'corr-headers',
        requestReference: 'req-ref-1', body: { note: 'forces content-type' }, query: { session_id: 'cs_test_123' }, parseResponse: (b) => b,
      })
    } finally { restore() }
  })

  await t.test('engagement acceptance forwards the trusted client IP; other routes omit it', async () => {
    const restore = stubFetch(async (url, init) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      const headers = init?.headers as Headers
      assert.equal(headers.get('x-krabiclaw-originating-client-ip'), url.includes('/engagement-contracts/contract-1/status') ? '203.0.113.9' : null)
      return Response.json({ ok: true })
    })
    try {
      const env = makeEnv()
      await callBlawbyRoute(env, { routeKey: 'engagementAcceptance', scope: 'legal:test-ip', method: 'PATCH', identity, correlationId: 'corr-ip-1', pathParam: 'contract-1', clientIp: '203.0.113.9', body: { status: 'accepted' }, parseResponse: (b) => b })
      // A non-engagement route with a caller-supplied clientIp must still omit it.
      await callBlawbyRoute(env, { routeKey: 'practiceRead', scope: 'legal:test-ip', method: 'GET', identity, correlationId: 'corr-ip-2', clientIp: '198.51.100.7', parseResponse: (b) => b })
    } finally { restore() }
  })

  await t.test('a redirect (any host, port, userinfo, or fragment) is rejected without a second request', async () => {
    let calls = 0
    const restore = stubFetch(async (url) => {
      if (url.endsWith('/oauth2/token')) return tokenResponse()
      calls += 1
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example:8443/x?u=user:pass@evil.example#frag' } })
    })
    try {
      await assert.rejects(
        () => callBlawbyRoute(makeEnv(), { routeKey: 'practiceRead', scope: 'legal:test-redirect', method: 'GET', identity, correlationId: 'corr-redirect', parseResponse: (b) => b }),
        (error: unknown) => { assert.equal(statusOf(error), 502); return true },
      )
      assert.equal(calls, 1)
    } finally { restore() }
  })

  await t.test('errors contain a request correlation id but never the upstream body', async () => {
    const restore = stubFetch(async (url) => url.endsWith('/oauth2/token')
      ? tokenResponse()
      : Response.json({ error: 'unexpected_upstream_shape', secret_leak: 'sk_live_should_never_appear', upstream_note: 'do not leak this body' }, { status: 418 }))
    try {
      await assert.rejects(
        () => callBlawbyRoute(makeEnv(), { routeKey: 'practiceRead', scope: 'legal:test-sanitize', method: 'GET', identity, correlationId: 'corr-sanitize-me', parseResponse: (b) => b }),
        (error: unknown) => {
          const serialized = JSON.stringify(error)
          assert.match(serialized, /corr-sanitize-me/)
          assert.doesNotMatch(serialized, /sk_live_should_never_appear/)
          assert.doesNotMatch(serialized, /do not leak this body/)
          return true
        },
      )
    } finally { restore() }
  })
})
