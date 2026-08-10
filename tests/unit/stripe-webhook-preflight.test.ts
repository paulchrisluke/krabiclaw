import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  STRIPE_WEBHOOK_API_VERSION,
  STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES,
  STRIPE_REQUEST_TIMEOUT_MS,
  STRIPE_WEBHOOK_PATH,
  STRIPE_WEBHOOK_EVENTS,
  StripeWebhookPreflightError,
  assertStripeLiveSecretKey,
  assertCanonicalStripeWebhookEndpointUrl,
  redactStripeEndpointId,
  normalizeStripeWebhookExpectedMode,
  normalizeWebhookEndpointUrl,
  runStripeWebhookEndpointPreflight,
} from '../../scripts/lib/stripe-webhook-preflight.mjs'
import { STRIPE_API_VERSION } from '../../shared/stripe-contract.ts'

const EXPECTED_URL = 'https://staging.krabiclaw.com/api/billing/webhook'
const TEST_ENDPOINT_ID = 'we_1TiXCP123abc'

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ENDPOINT_ID,
    url: `${EXPECTED_URL}/`,
    status: 'enabled',
    api_version: STRIPE_WEBHOOK_API_VERSION,
    enabled_events: [...STRIPE_WEBHOOK_EVENTS],
    ...overrides,
  }
}

function fakeStripeFactory(endpoints: unknown[], calls: { constructor?: unknown; list?: unknown[] } = {}) {
  return (secretKey: string, options: Record<string, unknown>) => {
    calls.constructor = { secretKey, options }
    return {
      webhookEndpoints: {
        list: async (params: unknown) => {
          calls.list ??= []
          calls.list.push(params)
          return { data: endpoints, has_more: false }
        },
      },
    }
  }
}

function fakeStripeFactoryWithPages(pages: unknown[], calls: { constructor?: unknown; list?: unknown[] } = {}) {
  return (secretKey: string, options: Record<string, unknown>) => {
    calls.constructor = { secretKey, options }
    let pageIndex = 0
    return {
      webhookEndpoints: {
        list: async (params: unknown) => {
          calls.list ??= []
          calls.list.push(params)
          const page = pages[pageIndex]
          pageIndex += 1
          return page
        },
      },
    }
  }
}

function fakeJsonResponse(body: unknown, { status = 200, stripeVersion }: { status?: number; stripeVersion?: string } = {}) {
  const headers = new Headers()
  if (stripeVersion !== undefined) headers.set('Stripe-Version', stripeVersion)
  return {
    status,
    headers,
    json: async () => body,
  }
}

function fakeFetch(response: unknown, calls: { url?: unknown; options?: unknown } = {}) {
  return async (url: unknown, options: unknown) => {
    calls.url = url
    calls.options = options
    return response
  }
}

test('Stripe webhook preflight normalizes URL and records a redacted endpoint contract', async () => {
  const calls: { constructor?: unknown; list?: unknown[] } = {}
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'sk_test_preflight',
    expectedUrl: `${EXPECTED_URL}/?ignored=1#fragment`,
    stripeFactory: fakeStripeFactory([endpoint()], calls),
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.accountMode, 'test')
  assert.equal(result.testMode, true)
  assert.equal(result.expectedUrl, EXPECTED_URL)
  assert.equal(result.endpointStatus, 'enabled')
  assert.equal(result.apiVersion, STRIPE_WEBHOOK_API_VERSION)
  assert.match(result.endpointId, /^we_[a-f0-9]{8}$/)
  assert.deepEqual(result.enabledEvents, [...STRIPE_WEBHOOK_EVENTS].sort())
  assert.deepEqual(calls.constructor, {
    secretKey: 'sk_test_preflight',
    options: { maxNetworkRetries: 0, timeout: STRIPE_REQUEST_TIMEOUT_MS },
  })
  assert.deepEqual(calls.list, [{ limit: 100 }])
  assert.doesNotMatch(JSON.stringify(result), /sk_test_preflight|endpoint_123/)
})

test('explicit live webhook preflight accepts only a live key and reports live account mode', async () => {
  const calls: { constructor?: unknown; list?: unknown[] } = {}
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'rk_live_preflight',
    expectedMode: 'live',
    expectedUrl: EXPECTED_URL.replace('staging.', ''),
    stripeFactory: fakeStripeFactory([endpoint({ url: 'https://krabiclaw.com/api/billing/webhook', id: 'we_2LiveEndpoint123' })], calls),
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.accountMode, 'live')
  assert.equal(result.testMode, false)
  assert.equal(result.expectedUrl, 'https://krabiclaw.com/api/billing/webhook')
  assert.deepEqual(calls.constructor, {
    secretKey: 'rk_live_preflight',
    options: { maxNetworkRetries: 0, timeout: STRIPE_REQUEST_TIMEOUT_MS },
  })
  assert.doesNotMatch(JSON.stringify(result), /rk_live_preflight|endpoint_123/)
})

test('live mode refuses a test key before provider construction', async () => {
  let constructed = false
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_not_live',
      expectedMode: 'live',
      expectedUrl: 'https://krabiclaw.com/api/billing/webhook',
      stripeFactory: () => {
        constructed = true
        throw new Error('provider must not be constructed')
      },
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'live_key_required',
  )
  assert.equal(constructed, false)
})

test('webhook preflight mode validation remains explicit and fail-closed', () => {
  assert.equal(normalizeStripeWebhookExpectedMode(), 'test')
  assert.equal(normalizeStripeWebhookExpectedMode('LIVE'), 'live')
  assert.equal(assertStripeLiveSecretKey('rk_live_mode'), 'rk_live_mode')
  assert.throws(
    () => normalizeStripeWebhookExpectedMode('production'),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'expected_mode_invalid',
  )
})

test('Stripe webhook preflight hard-refuses a live key before constructing the provider', async () => {
  let constructed = false
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_live_never_call',
      expectedUrl: EXPECTED_URL,
      stripeFactory: () => {
        constructed = true
        throw new Error('provider must not be constructed')
      },
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'test_key_required',
  )
  assert.equal(constructed, false)
})

test('Stripe webhook preflight rejects current staging drift instead of accepting legacy invoice events', async () => {
  const drift = [...STRIPE_WEBHOOK_EVENTS.filter(event => event !== 'invoice.paid'), 'invoice.payment_succeeded']

  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ enabled_events: drift })]),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'event_set_mismatch')
      assert.deepEqual(error.evidence.missingEvents, ['invoice.paid'])
      assert.deepEqual(error.evidence.extraEvents, ['invoice.payment_succeeded'])
      return true
    },
  )
})

test('Stripe webhook preflight rejects malformed or duplicate event inventories', async () => {
  for (const enabledEvents of [
    [...STRIPE_WEBHOOK_EVENTS, null],
    [...STRIPE_WEBHOOK_EVENTS, STRIPE_WEBHOOK_EVENTS[0]],
  ]) {
    await assert.rejects(
      runStripeWebhookEndpointPreflight({
        secretKey: 'sk_test_preflight',
        expectedUrl: EXPECTED_URL,
        stripeFactory: fakeStripeFactory([endpoint({ enabled_events: enabledEvents })]),
      }),
      (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'event_set_mismatch',
    )
  }
})

test('Stripe webhook preflight rejects an API version drift from the inbound webhook contract', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: '2025-04-30.basil' })]),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'api_version_mismatch')
      assert.equal(error.evidence.apiVersion, '2025-04-30.basil')
      assert.equal(error.evidence.expectedApiVersion, STRIPE_WEBHOOK_API_VERSION)
      return true
    },
  )
})

test('Stripe webhook preflight does not raw-read an explicitly versioned endpoint', async () => {
  let fetchCalls = 0
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'sk_test_preflight',
    expectedUrl: EXPECTED_URL,
    stripeFactory: fakeStripeFactory([endpoint()]),
    fetchImpl: async () => {
      fetchCalls += 1
      throw new Error('raw endpoint read must not run')
    },
  })

  assert.equal(result.apiVersionSource, 'endpoint')
  assert.equal(fetchCalls, 0)
})

test('Stripe webhook preflight redacts only valid endpoint ids with the webhook prefix', () => {
  assert.match(redactStripeEndpointId(TEST_ENDPOINT_ID), /^we_[a-f0-9]{8}$/)
  assert.match(redactStripeEndpointId('we_bad-id'), /^stripe_[a-f0-9]{8}$/)
})

test('Stripe webhook preflight rejects an invalid selected endpoint id before provider reads', async () => {
  let fetchCalls = 0
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ id: 'we_bad-id' })]),
      fetchImpl: async () => {
        fetchCalls += 1
        throw new Error('raw endpoint read must not run')
      },
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'endpoint_id_invalid',
  )
  assert.equal(fetchCalls, 0)
})

test('Stripe webhook preflight accepts an inherited account default proven by a raw endpoint response', async () => {
  const calls: { url?: unknown; options?: unknown } = {}
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'sk_test_preflight',
    expectedUrl: EXPECTED_URL,
    stripeFactory: fakeStripeFactoryWithPages([{
      data: [endpoint({ api_version: null })],
      has_more: false,
      lastResponse: { apiVersion: '2026-04-22.dahlia' },
    }]),
    fetchImpl: fakeFetch(fakeJsonResponse({
      id: TEST_ENDPOINT_ID,
      url: EXPECTED_URL,
      status: 'enabled',
      api_version: null,
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
    }, { stripeVersion: STRIPE_WEBHOOK_API_VERSION }), calls),
  })

  assert.equal(result.apiVersion, null)
  assert.equal(result.apiVersionSource, 'account_default')
  assert.equal(result.effectiveApiVersion, STRIPE_WEBHOOK_API_VERSION)
  assert.deepEqual(result.accountDefaultApiVersions, [STRIPE_WEBHOOK_API_VERSION])
  assert.equal(calls.url, `https://api.stripe.com/v1/webhook_endpoints/${TEST_ENDPOINT_ID}`)
  assert.deepEqual(calls.options && (calls.options as { method?: string; headers?: Record<string, string>; retry?: number }).method, 'GET')
  const requestOptions = calls.options as { headers: Record<string, string>; retry: number; signal: unknown }
  assert.deepEqual(requestOptions.headers, {
    Authorization: 'Bearer sk_test_preflight',
    Accept: 'application/json',
  })
  assert.equal(requestOptions.headers['Stripe-Version'], undefined)
  assert.equal(requestOptions.retry, 0)
  assert.ok(requestOptions.signal)
})

test('Stripe webhook preflight rejects an inherited account default without a response version header', async () => {
  const calls: { url?: unknown; options?: unknown } = {}
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactoryWithPages([{
        data: [endpoint({ api_version: null })],
        has_more: false,
        lastResponse: { apiVersion: '2026-04-22.dahlia' },
      }]),
      fetchImpl: fakeFetch(fakeJsonResponse({
        id: TEST_ENDPOINT_ID,
        url: EXPECTED_URL,
        status: 'enabled',
        api_version: null,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      }), calls),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'account_default_missing')
      assert.equal(error.evidence.apiVersionSource, 'account_default')
      assert.equal(error.evidence.effectiveApiVersion, null)
      assert.deepEqual(error.evidence.accountDefaultApiVersions, [])
      return true
    },
  )
  assert.equal(calls.url, `https://api.stripe.com/v1/webhook_endpoints/${TEST_ENDPOINT_ID}`)
})

test('Stripe webhook preflight rejects an inherited account default that differs from the contract', async () => {
  const observedApiVersion = '2025-04-30.basil'
  const calls: { url?: unknown; options?: unknown } = {}

  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactoryWithPages([{
        data: [endpoint({ api_version: null })],
        has_more: false,
        lastResponse: { apiVersion: '2026-04-22.dahlia' },
      }]),
      fetchImpl: fakeFetch(fakeJsonResponse({
        id: TEST_ENDPOINT_ID,
        url: EXPECTED_URL,
        status: 'enabled',
        api_version: null,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      }, { stripeVersion: observedApiVersion }), calls),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'account_default_mismatch')
      assert.equal(error.evidence.effectiveApiVersion, observedApiVersion)
      assert.deepEqual(error.evidence.accountDefaultApiVersions, [observedApiVersion])
      return true
    },
  )
})

test('Stripe webhook preflight does not trust pinned Stripe client response versions for an inherited default', async () => {
  const calls: { url?: unknown; options?: unknown } = {}
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'sk_test_preflight',
    expectedUrl: EXPECTED_URL,
    stripeFactory: fakeStripeFactoryWithPages([
      {
        data: [endpoint({ api_version: null })],
        has_more: true,
        lastResponse: { apiVersion: STRIPE_WEBHOOK_API_VERSION },
      },
      {
      data: [{ ...endpoint({ api_version: null }), id: 'we_2ndEndpoint456', url: 'https://other.example.test/webhook' }],
        has_more: false,
        lastResponse: { apiVersion: '2025-04-30.basil' },
      },
    ]),
    fetchImpl: fakeFetch(fakeJsonResponse({
      id: TEST_ENDPOINT_ID,
      url: EXPECTED_URL,
      status: 'enabled',
      api_version: null,
      enabled_events: [...STRIPE_WEBHOOK_EVENTS],
    }, { stripeVersion: STRIPE_WEBHOOK_API_VERSION }), calls),
  })
  assert.equal(result.effectiveApiVersion, STRIPE_WEBHOOK_API_VERSION)
  assert.equal(calls.url, `https://api.stripe.com/v1/webhook_endpoints/${TEST_ENDPOINT_ID}`)
})

test('Stripe webhook preflight rejects a non-2xx inherited-default endpoint response', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: null })]),
      fetchImpl: fakeFetch(fakeJsonResponse(null, { status: 500, stripeVersion: STRIPE_WEBHOOK_API_VERSION })),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'account_default_http')
      assert.equal(error.evidence.accountDefaultHttpStatus, 500)
      return true
    },
  )
})

test('Stripe webhook preflight rejects a malformed inherited-default endpoint body', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: null })]),
      fetchImpl: async () => ({
        status: 200,
        headers: new Headers({ 'Stripe-Version': STRIPE_WEBHOOK_API_VERSION }),
        json: async () => { throw new Error('malformed') },
      }),
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'account_default_malformed',
  )
})

test('Stripe webhook preflight rejects a primitive inherited-default endpoint body', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: null })]),
      fetchImpl: fakeFetch(fakeJsonResponse('not-an-endpoint', { stripeVersion: STRIPE_WEBHOOK_API_VERSION })),
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'account_default_malformed',
  )
})

test('Stripe webhook preflight rejects an inherited-default endpoint body bound to a different id', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: null })]),
      fetchImpl: fakeFetch(fakeJsonResponse({
        id: 'we_otherEndpoint',
        url: EXPECTED_URL,
        status: 'enabled',
        api_version: null,
        enabled_events: [...STRIPE_WEBHOOK_EVENTS],
      }, { stripeVersion: STRIPE_WEBHOOK_API_VERSION })),
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'account_default_body_mismatch',
  )
})

test('Stripe webhook preflight binds inherited-default body events to the inventory', async () => {
  const drift = [...STRIPE_WEBHOOK_EVENTS.filter(event => event !== 'invoice.paid'), 'invoice.payment_succeeded']
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint({ api_version: null })]),
      fetchImpl: fakeFetch(fakeJsonResponse({
        id: TEST_ENDPOINT_ID,
        url: EXPECTED_URL,
        status: 'enabled',
        api_version: null,
        enabled_events: drift,
      }, { stripeVersion: STRIPE_WEBHOOK_API_VERSION })),
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'account_default_body_mismatch',
  )
})

test('Stripe webhook preflight bounds provider pagination reads', async () => {
  const calls: { list?: unknown[] } = {}
  const pages = Array.from({ length: STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES }, (_, index) => ({
    data: [{ ...endpoint({ id: `we_pagination${index}`, url: `https://other-${index}.example.test/webhook` }) }],
    has_more: true,
    lastResponse: { apiVersion: STRIPE_WEBHOOK_API_VERSION },
  }))

  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactoryWithPages(pages, calls),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'endpoint_pagination_limit')
      assert.equal(error.evidence.pageCount, STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES)
      assert.equal(error.evidence.maxPages, STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES)
      return true
    },
  )
  assert.equal(calls.list?.length, STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES)
})

test('Stripe webhook preflight rejects an invalid pagination cursor', async () => {
  const calls: { list?: unknown[] } = {}
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactoryWithPages([{
        data: [endpoint({ id: 'we_bad-id', url: 'https://other.example.test/webhook' })],
        has_more: true,
      }], calls),
    }),
    (error: unknown) => {
      assert.ok(error instanceof StripeWebhookPreflightError)
      assert.equal(error.code, 'endpoint_pagination_invalid')
      assert.match(error.evidence.cursorEndpointId, /^stripe_[a-f0-9]{8}$/)
      return true
    },
  )
  assert.equal(calls.list?.length, 1)
})

test('Stripe client and webhook event-rendering versions remain explicit and independent', () => {
  assert.equal(STRIPE_API_VERSION, '2026-04-22.dahlia')
  assert.equal(STRIPE_WEBHOOK_API_VERSION, '2025-11-17.clover')
  assert.notEqual(STRIPE_API_VERSION, STRIPE_WEBHOOK_API_VERSION)
})

test('Stripe webhook preflight rejects duplicate enabled destinations at the expected URL', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint(), endpoint({ id: 'we_2ndEndpoint456' })]),
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'endpoint_count',
  )
})

test('Stripe webhook preflight normalizes only HTTPS URLs without credentials', () => {
  assert.equal(normalizeWebhookEndpointUrl(`${EXPECTED_URL}//?x=1`), EXPECTED_URL)
  assert.throws(() => normalizeWebhookEndpointUrl('http://staging.krabiclaw.com/api/billing/webhook'), /HTTPS/)
  assert.throws(() => normalizeWebhookEndpointUrl('https://user:pass@staging.krabiclaw.com/webhook'), /credentials/)
})

test('Stripe webhook preflight refuses the Better Auth internal path as a registered destination', () => {
  assert.equal(assertCanonicalStripeWebhookEndpointUrl(EXPECTED_URL), EXPECTED_URL)
  assert.throws(
    () => assertCanonicalStripeWebhookEndpointUrl('https://staging.krabiclaw.com/api/auth/stripe/webhook'),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'expected_url_path',
  )
})

test('Stripe webhook preflight refuses a wrong destination before provider construction', async () => {
  let constructed = false
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: 'https://staging.krabiclaw.com/api/auth/stripe/webhook',
      stripeFactory: () => {
        constructed = true
        throw new Error('provider must not be constructed')
      },
    }),
    (error: unknown) => error instanceof StripeWebhookPreflightError && error.code === 'expected_url_path',
  )
  assert.equal(constructed, false)
})

test('Stripe webhook preflight targets the registered application route and shared API contract', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/ci-full.yml'), 'utf8')
  const route = await readFile(resolve(process.cwd(), 'server/api/billing/webhook.post.ts'), 'utf8')
  assert.equal(STRIPE_WEBHOOK_PATH, '/api/billing/webhook')
  assert.match(route, /defineEventHandler/)
  assert.match(route, /target\.pathname = '\/api\/auth\/stripe\/webhook'/)
  assert.match(workflow, /STRIPE_WEBHOOK_PATH/)
  assert.match(workflow, /STRIPE_WEBHOOK_ENDPOINT_URL="\$\{STAGING_BASE_URL%\/\}\$stripe_webhook_path"/)
  assert.match(workflow, /node --experimental-strip-types scripts\/preflight-stripe-webhook-endpoint\.mjs/)
})
