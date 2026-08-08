import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  STRIPE_API_VERSION,
  STRIPE_REQUEST_TIMEOUT_MS,
  STRIPE_WEBHOOK_PATH,
  STRIPE_WEBHOOK_EVENTS,
  StripeWebhookPreflightError,
  assertCanonicalStripeWebhookEndpointUrl,
  normalizeWebhookEndpointUrl,
  runStripeWebhookEndpointPreflight,
} from '../../scripts/lib/stripe-webhook-preflight.mjs'

const EXPECTED_URL = 'https://staging.krabiclaw.com/api/billing/webhook'
const TEST_ENDPOINT_ID = 'we_test_endpoint_123'

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ENDPOINT_ID,
    url: `${EXPECTED_URL}/`,
    status: 'enabled',
    api_version: STRIPE_API_VERSION,
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

test('Stripe webhook preflight normalizes URL and records a redacted endpoint contract', async () => {
  const calls: { constructor?: unknown; list?: unknown[] } = {}
  const result = await runStripeWebhookEndpointPreflight({
    secretKey: 'sk_test_preflight',
    expectedUrl: `${EXPECTED_URL}/?ignored=1#fragment`,
    stripeFactory: fakeStripeFactory([endpoint()], calls),
  })

  assert.equal(result.status, 'passed')
  assert.equal(result.testMode, true)
  assert.equal(result.expectedUrl, EXPECTED_URL)
  assert.equal(result.endpointStatus, 'enabled')
  assert.equal(result.apiVersion, STRIPE_API_VERSION)
  assert.match(result.endpointId, /^we_test_[a-f0-9]{8}$/)
  assert.deepEqual(result.enabledEvents, [...STRIPE_WEBHOOK_EVENTS].sort())
  assert.deepEqual(calls.constructor, {
    secretKey: 'sk_test_preflight',
    options: { maxNetworkRetries: 0, timeout: STRIPE_REQUEST_TIMEOUT_MS },
  })
  assert.deepEqual(calls.list, [{ limit: 100 }])
  assert.doesNotMatch(JSON.stringify(result), /sk_test_preflight|endpoint_123/)
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

test('Stripe webhook preflight rejects an API version drift from the application client', async () => {
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
      assert.equal(error.evidence.expectedApiVersion, STRIPE_API_VERSION)
      return true
    },
  )
})

test('Stripe webhook preflight rejects duplicate enabled destinations at the expected URL', async () => {
  await assert.rejects(
    runStripeWebhookEndpointPreflight({
      secretKey: 'sk_test_preflight',
      expectedUrl: EXPECTED_URL,
      stripeFactory: fakeStripeFactory([endpoint(), endpoint({ id: 'we_test_endpoint_456' })]),
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
