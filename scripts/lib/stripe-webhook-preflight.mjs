import { createHash } from 'node:crypto'
import {
  STRIPE_WEBHOOK_API_VERSION,
  STRIPE_REQUEST_TIMEOUT_MS,
  STRIPE_WEBHOOK_PATH,
} from '../../shared/stripe-contract.ts'

export const STRIPE_WEBHOOK_EVENTS = Object.freeze([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
])

export const STRIPE_TEST_SECRET_KEY = /^(?:sk|rk)_test_[A-Za-z0-9]+$/
export const STRIPE_LIVE_SECRET_KEY = /^(?:sk|rk)_live_[A-Za-z0-9]+$/
export const STRIPE_WEBHOOK_EXPECTED_MODES = Object.freeze(['test', 'live'])
export { STRIPE_WEBHOOK_API_VERSION, STRIPE_REQUEST_TIMEOUT_MS, STRIPE_WEBHOOK_PATH }

export class StripeWebhookPreflightError extends Error {
  constructor(code, message, evidence = {}) {
    super(message)
    this.name = 'StripeWebhookPreflightError'
    this.code = code
    this.evidence = evidence
  }
}

export function normalizeStripeWebhookExpectedMode(value = 'test') {
  const mode = String(value ?? '').trim().toLowerCase() || 'test'
  if (!STRIPE_WEBHOOK_EXPECTED_MODES.includes(mode)) {
    throw new StripeWebhookPreflightError(
      'expected_mode_invalid',
      'Stripe webhook preflight expected mode must be test or live.',
      { expectedMode: mode },
    )
  }
  return mode
}

export function assertStripeSecretKey(value, expectedMode = 'test') {
  const mode = normalizeStripeWebhookExpectedMode(expectedMode)
  const secretKey = String(value ?? '').trim()
  const pattern = mode === 'live' ? STRIPE_LIVE_SECRET_KEY : STRIPE_TEST_SECRET_KEY
  if (!pattern.test(secretKey)) {
    throw new StripeWebhookPreflightError(
      mode === 'live' ? 'live_key_required' : 'test_key_required',
      `Stripe webhook preflight requires a ${mode}-mode secret key.`,
      { expectedMode: mode },
    )
  }
  return secretKey
}

export function assertStripeTestSecretKey(value) {
  return assertStripeSecretKey(value, 'test')
}

export function assertStripeLiveSecretKey(value) {
  return assertStripeSecretKey(value, 'live')
}

export function normalizeWebhookEndpointUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new StripeWebhookPreflightError('expected_url_required', 'Expected Stripe webhook URL is required.')

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new StripeWebhookPreflightError('expected_url_invalid', 'Expected Stripe webhook URL is invalid.')
  }
  if (parsed.protocol !== 'https:') {
    throw new StripeWebhookPreflightError('expected_url_https', 'Expected Stripe webhook URL must use HTTPS.')
  }
  if (parsed.username || parsed.password) {
    throw new StripeWebhookPreflightError('expected_url_credentials', 'Expected Stripe webhook URL may not contain credentials.')
  }

  parsed.search = ''
  parsed.hash = ''
  parsed.pathname = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  return parsed.toString()
}

export function assertCanonicalStripeWebhookEndpointUrl(value) {
  const normalized = normalizeWebhookEndpointUrl(value)
  if (new URL(normalized).pathname !== STRIPE_WEBHOOK_PATH) {
    throw new StripeWebhookPreflightError(
      'expected_url_path',
      'Stripe webhook preflight expected the application webhook route.',
      { expectedUrl: normalized, expectedPath: STRIPE_WEBHOOK_PATH },
    )
  }
  return normalized
}

export function redactStripeEndpointId(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null
  const id = value.trim()
  const prefix = id.split('_').slice(0, 2).join('_') || 'stripe'
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 8)
  return `${prefix}_${digest}`
}

function sortedUnique(values) {
  return [...new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])].sort()
}

function endpointEvidence(endpoint, expectedUrl, expectedApiVersion, matchedCount, enabledCount) {
  return {
    expectedUrl,
    endpointId: redactStripeEndpointId(endpoint?.id),
    endpointStatus: typeof endpoint?.status === 'string' ? endpoint.status : null,
    apiVersion: typeof endpoint?.api_version === 'string' ? endpoint.api_version : null,
    expectedApiVersion,
    enabledEvents: sortedUnique(endpoint?.enabled_events),
    matchedEndpointCount: matchedCount,
    enabledEndpointCount: enabledCount,
  }
}

export function validateStripeWebhookEndpointContract({
  expectedUrl,
  endpoints,
  expectedApiVersion = STRIPE_WEBHOOK_API_VERSION,
  accountMode = 'test',
}) {
  const normalizedAccountMode = normalizeStripeWebhookExpectedMode(accountMode)
  const normalizedExpectedUrl = assertCanonicalStripeWebhookEndpointUrl(expectedUrl)
  const candidates = (Array.isArray(endpoints) ? endpoints : []).filter((endpoint) => {
    try {
      return normalizeWebhookEndpointUrl(endpoint?.url) === normalizedExpectedUrl
    } catch {
      return false
    }
  })
  const enabled = candidates.filter(endpoint => String(endpoint?.status ?? '').toLowerCase() === 'enabled')
  const endpoint = enabled[0] ?? candidates[0] ?? null
  const baseEvidence = endpointEvidence(endpoint, normalizedExpectedUrl, expectedApiVersion, candidates.length, enabled.length)

  if (enabled.length !== 1) {
    throw new StripeWebhookPreflightError(
      'endpoint_count',
      'Stripe webhook preflight requires exactly one enabled endpoint at the expected URL.',
      baseEvidence,
    )
  }

  if (baseEvidence.apiVersion !== expectedApiVersion) {
    throw new StripeWebhookPreflightError(
      'api_version_mismatch',
      'Stripe webhook endpoint API version does not match the application contract.',
      baseEvidence,
    )
  }

  const expectedEvents = sortedUnique(STRIPE_WEBHOOK_EVENTS)
  const observedEvents = sortedUnique(endpoint.enabled_events)
  const expectedSet = new Set(expectedEvents)
  const observedSet = new Set(observedEvents)
  const missingEvents = expectedEvents.filter(event => !observedSet.has(event))
  const extraEvents = observedEvents.filter(event => !expectedSet.has(event))
  if (missingEvents.length || extraEvents.length || observedEvents.length !== expectedEvents.length) {
    throw new StripeWebhookPreflightError(
      'event_set_mismatch',
      'Stripe webhook endpoint events do not match the application contract.',
      { ...baseEvidence, missingEvents, extraEvents },
    )
  }

  return {
    status: 'passed',
    accountMode: normalizedAccountMode,
    testMode: normalizedAccountMode === 'test',
    ...baseEvidence,
    enabledEvents: observedEvents,
    missingEvents: [],
    extraEvents: [],
  }
}

async function listAllWebhookEndpoints(stripe) {
  const endpoints = []
  let startingAfter
  for (;;) {
    const page = await stripe.webhookEndpoints.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    const data = Array.isArray(page?.data) ? page.data : []
    endpoints.push(...data)
    if (!page?.has_more) return endpoints
    const lastId = data.at(-1)?.id
    if (!lastId) {
      throw new StripeWebhookPreflightError('endpoint_pagination_invalid', 'Stripe webhook endpoint pagination was incomplete.')
    }
    startingAfter = lastId
  }
}

export async function runStripeWebhookEndpointPreflight({
  secretKey,
  expectedUrl,
  expectedApiVersion = STRIPE_WEBHOOK_API_VERSION,
  expectedMode = 'test',
  accountMode,
  stripeFactory,
}) {
  // Validate the key and URL before the Stripe client is constructed. This is
  // intentionally the first provider-related operation in the preflight.
  const normalizedExpectedMode = normalizeStripeWebhookExpectedMode(accountMode ?? expectedMode)
  const validatedSecretKey = assertStripeSecretKey(secretKey, normalizedExpectedMode)
  const normalizedExpectedUrl = assertCanonicalStripeWebhookEndpointUrl(expectedUrl)
  if (typeof stripeFactory !== 'function') throw new TypeError('stripeFactory is required')

  const stripe = stripeFactory(validatedSecretKey, {
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
  })
  let endpoints
  try {
    endpoints = await listAllWebhookEndpoints(stripe)
  } catch (error) {
    if (error instanceof StripeWebhookPreflightError) throw error
    throw new StripeWebhookPreflightError('provider_request_failed', 'Stripe webhook endpoint read failed.')
  }
  return validateStripeWebhookEndpointContract({
    expectedUrl: normalizedExpectedUrl,
    expectedApiVersion,
    accountMode: normalizedExpectedMode,
    endpoints,
  })
}
