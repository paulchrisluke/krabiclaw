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
export const STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES = 10
const STRIPE_WEBHOOK_ENDPOINTS_API_URL = 'https://api.stripe.com/v1/webhook_endpoints'
const STRIPE_WEBHOOK_ENDPOINT_ID = /^we_[A-Za-z0-9]+$/
export { STRIPE_WEBHOOK_API_VERSION, STRIPE_REQUEST_TIMEOUT_MS, STRIPE_WEBHOOK_PATH }

function isStripeWebhookEndpointId(value) {
  return typeof value === 'string' && STRIPE_WEBHOOK_ENDPOINT_ID.test(value)
}

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
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 8)
  return `${STRIPE_WEBHOOK_ENDPOINT_ID.test(value) ? 'we' : 'stripe'}_${digest}`
}

function sortedUnique(values) {
  return [...new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])].sort()
}

function isExactStringSet(values, expected) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) return false
  const normalized = sortedUnique(values)
  return normalized.length === values.length
    && normalized.length === expected.length
    && normalized.every((value, index) => value === expected[index])
}

const MAX_ACCOUNT_DEFAULT_API_VERSIONS_IN_EVIDENCE = 16

function boundedSortedUnique(values) {
  const all = sortedUnique(values)
  return {
    values: all.slice(0, MAX_ACCOUNT_DEFAULT_API_VERSIONS_IN_EVIDENCE),
    truncated: all.length > MAX_ACCOUNT_DEFAULT_API_VERSIONS_IN_EVIDENCE,
  }
}

function accountDefaultEvidence(responseApiVersions) {
  const observed = Array.isArray(responseApiVersions) ? responseApiVersions : []
  const missingResponseCount = observed.length === 0
    ? 1
    : observed.filter(value => typeof value !== 'string').length
  const { values, truncated } = boundedSortedUnique(observed)
  const effectiveApiVersion = missingResponseCount === 0 && values.length === 1 ? values[0] : null
  return {
    accountDefaultApiVersions: values,
    accountDefaultApiVersionsTruncated: truncated,
    accountDefaultResponseCount: observed.length,
    accountDefaultMissingResponseCount: missingResponseCount,
    effectiveApiVersion,
  }
}

function endpointEvidence(endpoint, expectedUrl, expectedApiVersion, matchedCount, enabledCount, responseApiVersions = []) {
  const endpointApiVersion = endpoint?.api_version
  const apiVersion = typeof endpointApiVersion === 'string' ? endpointApiVersion : null
  const apiVersionSource = endpointApiVersion === null ? 'account_default' : 'endpoint'
  const defaultEvidence = apiVersionSource === 'account_default'
    ? accountDefaultEvidence(responseApiVersions)
    : {
        accountDefaultApiVersions: [],
        accountDefaultApiVersionsTruncated: false,
        accountDefaultResponseCount: 0,
        accountDefaultMissingResponseCount: 0,
        effectiveApiVersion: apiVersion,
      }
  return {
    expectedUrl,
    endpointId: redactStripeEndpointId(endpoint?.id),
    endpointStatus: typeof endpoint?.status === 'string' ? endpoint.status : null,
    apiVersion,
    apiVersionSource,
    ...defaultEvidence,
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
  accountDefaultResponseApiVersions = [],
}) {
  const normalizedAccountMode = normalizeStripeWebhookExpectedMode(accountMode)
  const normalizedExpectedUrl = assertCanonicalStripeWebhookEndpointUrl(expectedUrl)
  const { candidates, enabled, endpoint } = selectWebhookEndpoint(endpoints, normalizedExpectedUrl)
  const baseEvidence = endpointEvidence(
    endpoint,
    normalizedExpectedUrl,
    expectedApiVersion,
    candidates.length,
    enabled.length,
    accountDefaultResponseApiVersions,
  )

  if (enabled.length !== 1) {
    throw new StripeWebhookPreflightError(
      'endpoint_count',
      'Stripe webhook preflight requires exactly one enabled endpoint at the expected URL.',
      baseEvidence,
    )
  }

  if (!isStripeWebhookEndpointId(endpoint?.id)) {
    throw new StripeWebhookPreflightError(
      'endpoint_id_invalid',
      'Stripe webhook preflight requires a valid webhook endpoint identity.',
      baseEvidence,
    )
  }

  if (baseEvidence.apiVersionSource === 'endpoint' && baseEvidence.apiVersion !== expectedApiVersion) {
    throw new StripeWebhookPreflightError(
      'api_version_mismatch',
      'Stripe webhook endpoint API version does not match the application contract.',
      baseEvidence,
    )
  }

  if (baseEvidence.apiVersionSource === 'account_default') {
    if (baseEvidence.accountDefaultMissingResponseCount > 0) {
      throw new StripeWebhookPreflightError(
        'account_default_missing',
        'Stripe webhook account default API version was not proven by the endpoint response.',
        baseEvidence,
      )
    }
    if (baseEvidence.accountDefaultApiVersions.length !== 1) {
      throw new StripeWebhookPreflightError(
        'account_default_inconsistent',
        'Stripe webhook account default API version evidence was inconsistent.',
        baseEvidence,
      )
    }
    if (baseEvidence.effectiveApiVersion !== expectedApiVersion) {
      throw new StripeWebhookPreflightError(
        'account_default_mismatch',
        'Stripe webhook account default API version does not match the application contract.',
        baseEvidence,
      )
    }
  }

  const expectedEvents = sortedUnique(STRIPE_WEBHOOK_EVENTS)
  const observedEvents = sortedUnique(endpoint.enabled_events)
  const expectedSet = new Set(expectedEvents)
  const observedSet = new Set(observedEvents)
  const missingEvents = expectedEvents.filter(event => !observedSet.has(event))
  const extraEvents = observedEvents.filter(event => !expectedSet.has(event))
  if (!isExactStringSet(endpoint.enabled_events, expectedEvents) || missingEvents.length || extraEvents.length) {
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
  let pageCount = 0
  for (;;) {
    if (pageCount >= STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES) {
      throw new StripeWebhookPreflightError(
        'endpoint_pagination_limit',
        'Stripe webhook endpoint pagination exceeded the preflight safety limit.',
        { pageCount, maxPages: STRIPE_WEBHOOK_ENDPOINT_MAX_PAGES },
      )
    }
    const page = await stripe.webhookEndpoints.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    pageCount += 1
    const data = Array.isArray(page?.data) ? page.data : []
    endpoints.push(...data)
    if (!page?.has_more) return endpoints
    const lastId = data.at(-1)?.id
    if (!isStripeWebhookEndpointId(lastId)) {
      throw new StripeWebhookPreflightError(
        'endpoint_pagination_invalid',
        'Stripe webhook endpoint pagination was incomplete.',
        { pageCount, cursorEndpointId: redactStripeEndpointId(lastId) },
      )
    }
    startingAfter = lastId
  }
}

function selectWebhookEndpoint(endpoints, normalizedExpectedUrl) {
  const candidates = (Array.isArray(endpoints) ? endpoints : []).filter((endpoint) => {
    try {
      return normalizeWebhookEndpointUrl(endpoint?.url) === normalizedExpectedUrl
    } catch {
      return false
    }
  })
  const enabled = candidates.filter(endpoint => typeof endpoint?.status === 'string' && endpoint.status.toLowerCase() === 'enabled')
  return { candidates, enabled, endpoint: enabled[0] ?? candidates[0] ?? null }
}

function accountDefaultProbeEvidence(baseEvidence, responseApiVersion) {
  return {
    ...baseEvidence,
    ...accountDefaultEvidence(responseApiVersion === undefined ? [] : [responseApiVersion]),
  }
}

async function readInheritedStripeWebhookEndpoint({
  endpoint,
  expectedUrl,
  expectedApiVersion,
  secretKey,
  fetchImpl,
  baseEvidence,
  expectedEnabledEvents,
}) {
  const rawEndpointId = endpoint?.id
  const endpointId = typeof rawEndpointId === 'string' ? rawEndpointId : ''
  if (!isStripeWebhookEndpointId(endpointId)) {
    throw new StripeWebhookPreflightError(
      'account_default_endpoint_id_missing',
      'Stripe webhook account default endpoint identity was not available for verification.',
      baseEvidence,
    )
  }
  if (typeof fetchImpl !== 'function') {
    throw new StripeWebhookPreflightError(
      'account_default_request_failed',
      'Stripe webhook account default endpoint read failed.',
      baseEvidence,
    )
  }

  const requestUrl = `${STRIPE_WEBHOOK_ENDPOINTS_API_URL}/${encodeURIComponent(endpointId)}`
  let response
  try {
    response = await fetchImpl(requestUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(STRIPE_REQUEST_TIMEOUT_MS),
      retry: 0,
    })
  } catch {
    throw new StripeWebhookPreflightError(
      'account_default_request_failed',
      'Stripe webhook account default endpoint read failed.',
      baseEvidence,
    )
  }

  const status = response?.status
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new StripeWebhookPreflightError(
      'account_default_http',
      'Stripe webhook account default endpoint read returned a non-success response.',
      { ...baseEvidence, accountDefaultHttpStatus: Number.isInteger(status) ? status : null },
    )
  }

  let body
  try {
    if (typeof response?.json !== 'function') throw new Error('json_unavailable')
    body = await response.json()
  } catch {
    throw new StripeWebhookPreflightError(
      'account_default_malformed',
      'Stripe webhook account default endpoint response was malformed.',
      baseEvidence,
    )
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new StripeWebhookPreflightError(
      'account_default_malformed',
      'Stripe webhook account default endpoint response was malformed.',
      baseEvidence,
    )
  }

  const responseApiVersion = typeof response?.headers?.get === 'function'
    ? response.headers.get('stripe-version')
    : null
  const versionEvidence = accountDefaultProbeEvidence(baseEvidence, responseApiVersion)
  if (typeof responseApiVersion !== 'string' || !responseApiVersion) {
    throw new StripeWebhookPreflightError(
      'account_default_missing',
      'Stripe webhook account default API version was not returned by the endpoint response.',
      versionEvidence,
    )
  }
  if (responseApiVersion !== expectedApiVersion) {
    throw new StripeWebhookPreflightError(
      'account_default_mismatch',
      'Stripe webhook account default API version does not match the application contract.',
      versionEvidence,
    )
  }

  let normalizedBodyUrl
  try {
    normalizedBodyUrl = normalizeWebhookEndpointUrl(body?.url)
  } catch {
    normalizedBodyUrl = null
  }
  const bodyMatchesInventory = body
    && body.id === endpointId
    && normalizedBodyUrl === expectedUrl
    && body.status === endpoint.status
    && body.api_version === null
    && isExactStringSet(body.enabled_events, expectedEnabledEvents)
  if (!bodyMatchesInventory) {
    throw new StripeWebhookPreflightError(
      'account_default_body_mismatch',
      'Stripe webhook account default endpoint response did not match the registered endpoint.',
      versionEvidence,
    )
  }

  return { apiVersion: responseApiVersion }
}

export async function runStripeWebhookEndpointPreflight({
  secretKey,
  expectedUrl,
  expectedApiVersion = STRIPE_WEBHOOK_API_VERSION,
  expectedMode = 'test',
  accountMode,
  stripeFactory,
  fetchImpl = globalThis.fetch,
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

  const { candidates, enabled, endpoint } = selectWebhookEndpoint(endpoints, normalizedExpectedUrl)
  const inventoryEvidence = endpointEvidence(
    endpoint,
    normalizedExpectedUrl,
    expectedApiVersion,
    candidates.length,
    enabled.length,
  )
  if (enabled.length === 1 && !isStripeWebhookEndpointId(endpoint?.id)) {
    throw new StripeWebhookPreflightError(
      'endpoint_id_invalid',
      'Stripe webhook preflight requires a valid webhook endpoint identity.',
      inventoryEvidence,
    )
  }
  let accountDefaultResponseApiVersions = []
  if (enabled.length === 1 && endpoint?.api_version === null) {
    const probe = await readInheritedStripeWebhookEndpoint({
      endpoint,
      expectedUrl: normalizedExpectedUrl,
      expectedApiVersion,
      secretKey: validatedSecretKey,
      fetchImpl,
      baseEvidence: inventoryEvidence,
      expectedEnabledEvents: sortedUnique(endpoint.enabled_events),
    })
    accountDefaultResponseApiVersions = [probe.apiVersion]
  }
  return validateStripeWebhookEndpointContract({
    expectedUrl: normalizedExpectedUrl,
    expectedApiVersion,
    accountMode: normalizedExpectedMode,
    endpoints,
    accountDefaultResponseApiVersions,
  })
}
