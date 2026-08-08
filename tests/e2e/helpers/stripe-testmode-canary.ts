import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface StripeTestCanaryEnv {
  RUN_STRIPE_TEST_CANARY?: string
  STRIPE_SECRET_KEY?: string
  E2E_DEV_ROUTE_SECRET?: string
  STRIPE_CANARY_SOURCE_SHA?: string
  GITHUB_SHA?: string
  STRIPE_CANARY_WORKER_VERSION_ID?: string
  STRIPE_CANARY_EVIDENCE_PATH?: string
}

export interface StripeTestCanaryConfig {
  enabled: boolean
  secretKey: string | null
  devRouteSecret: string | null
  sourceSha: string | null
  workerVersionId: string | null
  evidencePath: string | null
}

const SOURCE_SHA = /^[0-9a-f]{40}$/i
const WORKER_VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST_SECRET_KEY = /^(?:sk|rk)_test_[A-Za-z0-9]+$/

/**
 * The provider canary is deliberately opt-in.  All other Playwright runs must
 * return the disabled config without looking at a key or attempting a remote
 * request.  The explicit run is a post-promotion staging gate only.
 */
export function assertStripeTestCanaryConfig(env: StripeTestCanaryEnv = process.env): StripeTestCanaryConfig {
  if (env.RUN_STRIPE_TEST_CANARY !== '1') {
    return {
      enabled: false,
      secretKey: null,
      devRouteSecret: null,
      sourceSha: null,
      workerVersionId: null,
      evidencePath: null,
    }
  }

  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? ''
  if (!TEST_SECRET_KEY.test(secretKey)) {
    throw new Error('Stripe test-mode canary requires STRIPE_SECRET_KEY to be sk_test_ or rk_test_.')
  }

  const devRouteSecret = env.E2E_DEV_ROUTE_SECRET?.trim() ?? ''
  if (!devRouteSecret) {
    throw new Error('Stripe test-mode canary requires the staging E2E_DEV_ROUTE_SECRET.')
  }

  const sourceSha = (env.STRIPE_CANARY_SOURCE_SHA ?? env.GITHUB_SHA ?? '').trim()
  if (!SOURCE_SHA.test(sourceSha)) {
    throw new Error('Stripe test-mode canary requires a full 40-character source SHA.')
  }

  const workerVersionId = env.STRIPE_CANARY_WORKER_VERSION_ID?.trim() ?? ''
  if (!WORKER_VERSION_ID.test(workerVersionId)) {
    throw new Error('Stripe test-mode canary requires the deployed candidate Worker version ID.')
  }

  const evidencePath = env.STRIPE_CANARY_EVIDENCE_PATH?.trim() || null
  if (!evidencePath) {
    throw new Error('Stripe test-mode canary requires STRIPE_CANARY_EVIDENCE_PATH.')
  }

  return { enabled: true, secretKey, devRouteSecret, sourceSha, workerVersionId, evidencePath }
}

function redactedIdPrefix(value: string): string {
  const parts = value.split('_')
  if (parts.length >= 2) return `${parts[0]}_${parts[1]}`
  return parts[0] ?? 'stripe'
}

/** Keep provider IDs useful for correlation without persisting raw IDs. */
export function redactStripeId(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 8)
  return `${redactedIdPrefix(value.trim())}_${digest}`
}

export interface StripeCanaryEvidenceInput {
  sourceSha: string
  baseUrl: string
  workerVersionId: string
  checkoutSessionId: string
  customerId?: string | null
  subscriptionId: string
  invoiceId: string
  webhookEventId: string
  siteCount: number
  statuses: {
    checkout: string
    subscription: string
    invoice: string
    webhook: string
    organizationBilling?: string
    entitlements?: string
    sites?: {
      expected: number
      observed: number
      plan: string
    }
  }
}

export interface StripeCanaryEvidence {
  schemaVersion: 1
  kind: 'stripe-testmode-checkout-canary'
  status: 'passed'
  testMode: true
  sourceSha: string
  baseUrl: string
  workerVersionId: string
  checkoutSessionId: string | null
  customerId: string | null
  subscriptionId: string | null
  invoiceId: string | null
  webhookEventId: string | null
  siteCount: number
  statuses: StripeCanaryEvidenceInput['statuses']
  capturedAt: string
}

export function buildStripeCanaryEvidence(input: StripeCanaryEvidenceInput): StripeCanaryEvidence {
  return {
    schemaVersion: 1,
    kind: 'stripe-testmode-checkout-canary',
    status: 'passed',
    testMode: true,
    sourceSha: input.sourceSha,
    baseUrl: input.baseUrl,
    workerVersionId: input.workerVersionId,
    checkoutSessionId: redactStripeId(input.checkoutSessionId),
    customerId: redactStripeId(input.customerId),
    subscriptionId: redactStripeId(input.subscriptionId),
    invoiceId: redactStripeId(input.invoiceId),
    webhookEventId: redactStripeId(input.webhookEventId),
    siteCount: input.siteCount,
    statuses: input.statuses,
    capturedAt: new Date().toISOString(),
  }
}

export async function writeStripeCanaryEvidence(path: string, evidence: StripeCanaryEvidence): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}
