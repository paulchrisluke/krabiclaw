import type Stripe from 'stripe'
import { execute, queryFirst, type DbClient } from '~/server/db'
import {
  invoiceSubscriptionId,
  MAX_STRIPE_WEBHOOK_ATTEMPTS,
} from '~/server/utils/better-auth-stripe'
import {
  createOperatorApprovalToken,
  OperatorApprovalError,
  sha256CanonicalJson,
  verifyOperatorApprovalToken,
} from '~/server/utils/operator-approval'
import {
  assertDirectOperatorSession,
  OperatorSessionError,
} from '~/server/utils/operator-session'
import type {
  OrganizationReconciliationProviderMode,
  OrganizationSubscriptionReconciliationReport,
} from '~/server/utils/organization-subscription-reconciliation'

const APPROVAL_WINDOW_MS = 10 * 60 * 1000
const RETAINED_PAYLOAD_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const APPROVAL_PURPOSE = 'stripe_processed_invoice_replay' as const

export interface StripeProcessedInvoiceReplayInput {
  organizationId: string
  stripeEventId: string
  providerMode: OrganizationReconciliationProviderMode
  expectedStripeAccountId: string
  reason: string
  idempotencyKey: string
}

export interface ParsedStripeProcessedInvoiceReplayRequest {
  mode: 'preview' | 'apply'
  input: StripeProcessedInvoiceReplayInput
  expectedStateSha256?: string
  approvalToken?: string
}

interface ReplayRepair {
  basePlanPriceId: string
  periodStart: string
  periodEnd: string
}

interface ReplayQuotaSnapshot {
  totalGrants: number
  planGrants: number
  appliedPlanGrants: number
  balance: number | null
  lifetimeUsed: number | null
  balancePeriodKey: string | null
}

interface StripeWebhookEventRow {
  id: string
  stripe_event_id: string
  event_type: string | null
  status: string | null
  payload: string | null
  error: string | null
  claimed_at: string | null
  lease_expires_at: string | null
  claim_token: string | null
  next_attempt_at: string | null
  attempt_count: number
  dead_lettered_at: string | null
  created_at: string
}

interface StripeInvoicePaymentRow {
  stripe_invoice_id: string
  organization_id: string
  stripe_subscription_id: string
  base_plan_price_id: string | null
  status: string | null
  period_start: string | null
  period_end: string | null
  last_event_created: number | null
  last_event_id: string | null
}

interface OrganizationBillingReplayRow {
  organization_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  access_plan: string | null
  access_expires_at: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  last_paid_invoice_id: string | null
  last_payment_event_created: number | null
  last_payment_event_id: string | null
  updated_at: string | null
}

interface RetainedInvoicePaidEvent {
  event: Stripe.Event
  invoiceId: string
  subscriptionId: string
  livemode: boolean
}

interface ReplayEvidence {
  eventRow: StripeWebhookEventRow
  retained: RetainedInvoicePaidEvent
  invoice: StripeInvoicePaymentRow
  organization: OrganizationBillingReplayRow
  quota: ReplayQuotaSnapshot
  payloadSha256: string
  repair: ReplayRepair
}

export interface StripeProcessedInvoiceReplayPlan {
  schemaVersion: 1
  kind: 'stripe-processed-invoice-replay'
  actor: string
  input: StripeProcessedInvoiceReplayInput
  reconciliation: {
    reportSha256: string
    status: OrganizationSubscriptionReconciliationReport['status']
    driftCodes: string[]
  }
  event: {
    stripeEventId: string
    invoiceId: string
    subscriptionId: string
    livemode: boolean
    status: string
    attemptCount: number
    createdAt: string
  }
  invoiceBefore: {
    basePlanPriceId: string | null
    periodStart: string | null
    periodEnd: string | null
    lastEventId: string | null
  }
  organizationBefore: {
    paymentStatus: string | null
    paidThrough: string | null
    lastPaidInvoiceId: string | null
  }
  quotaBefore: ReplayQuotaSnapshot
  repair: ReplayRepair
  payloadSha256: string
  expectedStateSha256: string
  expiresAt: string
  approvalToken: string
}

export type StripeProcessedInvoiceReplayPreviewResult =
  | { status: 'preview'; plan: StripeProcessedInvoiceReplayPlan }
  | { status: 'already_applied'; stripeEventId: string; invoiceId: string; paidThrough: string }

export type StripeProcessedInvoiceReplayApplyResult =
  | { status: 'queued'; stripeEventId: string; invoiceId: string; attemptCount: number }
  | { status: 'already_queued'; stripeEventId: string; invoiceId: string; attemptCount: number }
  | { status: 'already_applied'; stripeEventId: string; invoiceId: string; paidThrough: string }

export class StripeProcessedInvoiceReplayError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, statusCode: number, message: string) {
    super(message)
    this.name = 'StripeProcessedInvoiceReplayError'
    this.code = code
    this.statusCode = statusCode
  }
}

function fail(code: string, statusCode: number, message: string): never {
  throw new StripeProcessedInvoiceReplayError(code, statusCode, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') fail('invalid_request', 400, `${field} is required.`)
  const trimmed = value.trim()
  if (!trimmed || trimmed !== value || trimmed.length > maxLength) {
    fail('invalid_request', 400, `${field} must be a non-empty value without surrounding whitespace.`)
  }
  return trimmed
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(body).filter(key => !allowed.has(key))
  if (unknown.length > 0) fail('invalid_request', 400, `Unsupported processed invoice replay field: ${unknown[0]}`)
}

export function parseStripeProcessedInvoiceReplayRequest(body: unknown): ParsedStripeProcessedInvoiceReplayRequest {
  if (!isRecord(body)) fail('invalid_request', 400, 'A processed invoice replay body is required.')
  const mode = body.mode === undefined ? 'preview' : body.mode
  if (mode !== 'preview' && mode !== 'apply') fail('invalid_request', 400, 'mode must be preview or apply.')
  const allowed = new Set([
    'mode',
    'organizationId',
    'stripeEventId',
    'providerMode',
    'expectedStripeAccountId',
    'reason',
    'idempotencyKey',
  ])
  if (mode === 'apply') {
    allowed.add('expectedStateSha256')
    allowed.add('approvalToken')
  }
  rejectUnknownFields(body, allowed)

  const providerMode = requiredString(body.providerMode, 'providerMode', 4)
  if (providerMode !== 'test' && providerMode !== 'live') {
    fail('invalid_request', 400, 'providerMode must be test or live.')
  }
  const expectedStripeAccountId = requiredString(body.expectedStripeAccountId, 'expectedStripeAccountId', 64)
  if (!/^acct_[A-Za-z0-9]+$/u.test(expectedStripeAccountId)) {
    fail('invalid_request', 400, 'expectedStripeAccountId is malformed.')
  }
  const stripeEventId = requiredString(body.stripeEventId, 'stripeEventId', 255)
  const idempotencyKey = requiredString(body.idempotencyKey, 'idempotencyKey', 300)
  if (idempotencyKey !== `stripe-event:${stripeEventId}`) {
    fail('invalid_request', 400, 'idempotencyKey must be derived from the exact Stripe event id.')
  }
  const parsed: ParsedStripeProcessedInvoiceReplayRequest = {
    mode,
    input: {
      organizationId: requiredString(body.organizationId, 'organizationId', 128),
      stripeEventId,
      providerMode,
      expectedStripeAccountId,
      reason: requiredString(body.reason, 'reason', 1000),
      idempotencyKey,
    },
  }
  if (mode === 'apply') {
    const expectedStateSha256 = requiredString(body.expectedStateSha256, 'expectedStateSha256', 64)
    if (!/^[0-9a-f]{64}$/u.test(expectedStateSha256)) {
      fail('invalid_request', 400, 'expectedStateSha256 must be a lowercase SHA-256 digest.')
    }
    parsed.expectedStateSha256 = expectedStateSha256
    parsed.approvalToken = requiredString(body.approvalToken, 'approvalToken', 4096)
  }
  return parsed
}

export function assertStripeProcessedInvoiceReplayOperatorSession(session: unknown): string {
  try {
    return assertDirectOperatorSession(session)
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      fail(
        error.code,
        error.statusCode,
        error.code === 'impersonation_forbidden'
          ? 'Processed invoice replay cannot run in an impersonation session.'
          : error.message,
      )
    }
    throw error
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function safeCount(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail('state_invalid', 500, `${field} is malformed.`)
  return parsed
}

function nullableSafeInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail('state_invalid', 500, `${field} is malformed.`)
  return parsed
}

function parseRetainedInvoicePaidEvent(row: StripeWebhookEventRow, now: Date): RetainedInvoicePaidEvent {
  const createdAt = Date.parse(row.created_at)
  if (!Number.isFinite(createdAt) || createdAt < now.getTime() - RETAINED_PAYLOAD_WINDOW_MS) {
    fail('payload_expired', 409, 'The retained invoice.paid payload is outside the 90-day replay window.')
  }
  if (!row.payload) fail('payload_missing', 409, 'The retained invoice.paid payload is unavailable.')
  let parsed: unknown
  try {
    parsed = JSON.parse(row.payload)
  } catch {
    fail('payload_malformed', 409, 'The retained invoice.paid payload is not valid JSON.')
  }
  if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.object)) {
    fail('payload_malformed', 409, 'The retained payload is not a Stripe invoice event.')
  }
  if (
    parsed.id !== row.stripe_event_id
    || parsed.type !== 'invoice.paid'
    || row.event_type !== 'invoice.paid'
    || typeof parsed.livemode !== 'boolean'
    || !Number.isSafeInteger(parsed.created)
    || Number(parsed.created) <= 0
  ) {
    fail('payload_mismatch', 409, 'The retained payload does not match its stored invoice.paid identity.')
  }
  const invoice = parsed.data.object
  const invoiceId = typeof invoice.id === 'string' && invoice.id.trim() ? invoice.id.trim() : null
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!invoiceId || !subscriptionId) {
    fail('payload_malformed', 409, 'The retained invoice.paid payload omits invoice or subscription identity.')
  }
  return {
    event: parsed as unknown as Stripe.Event,
    invoiceId,
    subscriptionId,
    livemode: parsed.livemode,
  }
}

async function readEventRow(db: DbClient, stripeEventId: string): Promise<StripeWebhookEventRow> {
  const row = await queryFirst<StripeWebhookEventRow>(db, `
    SELECT id, stripe_event_id, event_type, status, payload, error,
           claimed_at, lease_expires_at, claim_token, next_attempt_at,
           attempt_count, dead_lettered_at, created_at
      FROM stripe_webhook_events
     WHERE stripe_event_id = ?
     LIMIT 1
  `, [stripeEventId])
  if (!row) fail('not_found', 404, 'Processed invoice.paid event was not found.')
  if (!row.id || !row.stripe_event_id || !row.created_at) fail('state_invalid', 500, 'Stored Stripe event state is malformed.')
  row.attempt_count = safeCount(row.attempt_count, 'Stripe event attempt_count')
  return row
}

async function readInvoiceRow(db: DbClient, invoiceId: string): Promise<StripeInvoicePaymentRow> {
  const row = await queryFirst<StripeInvoicePaymentRow>(db, `
    SELECT stripe_invoice_id, organization_id, stripe_subscription_id,
           base_plan_price_id, status, period_start, period_end,
           last_event_created, last_event_id
      FROM stripe_invoice_payments
     WHERE stripe_invoice_id = ?
     LIMIT 1
  `, [invoiceId])
  if (!row) fail('invoice_evidence_missing', 409, 'Local invoice payment evidence was not found.')
  return row
}

async function readOrganizationRow(db: DbClient, organizationId: string): Promise<OrganizationBillingReplayRow> {
  const row = await queryFirst<OrganizationBillingReplayRow>(db, `
    SELECT organization_id, stripe_customer_id, stripe_subscription_id, access_plan,
           access_expires_at, payment_status, paid_through, past_due_since,
           last_paid_invoice_id, last_payment_event_created,
           last_payment_event_id, updated_at
      FROM organization_billing
     WHERE organization_id = ?
     LIMIT 1
  `, [organizationId])
  if (!row) fail('organization_billing_missing', 409, 'Organization billing projection was not found.')
  return row
}

async function readQuotaSnapshot(db: DbClient, organizationId: string): Promise<ReplayQuotaSnapshot> {
  const grants = await queryFirst<{
    total_grants: unknown
    plan_grants: unknown
    applied_plan_grants: unknown
  }>(db, `
    SELECT COUNT(*) AS total_grants,
           SUM(CASE WHEN grant_type = 'plan' THEN 1 ELSE 0 END) AS plan_grants,
           SUM(CASE WHEN grant_type = 'plan' AND applied_at IS NOT NULL THEN 1 ELSE 0 END) AS applied_plan_grants
      FROM usage_quota_grants
     WHERE organization_id = ? AND resource = 'ai_inference'
  `, [organizationId])
  const usage = await queryFirst<{ lifetime_used: unknown }>(db, `
    SELECT COALESCE(SUM(quantity), 0) AS lifetime_used
      FROM usage_events
     WHERE organization_id = ? AND unit = 'credit'
  `, [organizationId])
  return {
    totalGrants: safeCount(grants?.total_grants ?? 0, 'quota grant count'),
    planGrants: safeCount(grants?.plan_grants ?? 0, 'plan grant count'),
    appliedPlanGrants: safeCount(grants?.applied_plan_grants ?? 0, 'applied plan grant count'),
    balance: null,
    lifetimeUsed: nullableSafeInteger(usage?.lifetime_used, 'AI credit lifetime usage'),
    balancePeriodKey: null,
  }
}

function exactIso(value: string | null, field: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) fail('provider_evidence_invalid', 409, `${field} is missing or malformed.`)
  return value
}

function validateProviderEvidence(
  report: OrganizationSubscriptionReconciliationReport,
  input: StripeProcessedInvoiceReplayInput,
  actor: string,
  retained: RetainedInvoicePaidEvent,
  organization: OrganizationBillingReplayRow,
): ReplayRepair {
  const unexpectedBlockedDrift = report.drifts.find(drift =>
    drift.severity === 'blocked'
    && drift.code !== 'app_projection_malformed'
    && drift.code !== 'app_projection_missing',
  )
  if (
    !/^[0-9a-f]{64}$/u.test(report.reportSha256)
    || report.operator.actor !== actor
    || report.request.organizationId !== input.organizationId
    || report.request.providerMode !== input.providerMode
    || report.request.expectedStripeAccountId !== input.expectedStripeAccountId
    || report.provider.mode !== input.providerMode
    || !report.provider.modeVerified
    || !report.provider.account.verified
    || report.provider.account.id !== input.expectedStripeAccountId
    || report.provider.customer.id !== organization.stripe_customer_id
    || report.provider.customer.deleted
    || report.provider.customer.metadata?.ownerMetadataConflict
    || report.provider.customer.metadata?.ownerId !== input.organizationId
    || report.provider.customer.metadata?.customerType !== 'organization'
    || report.betterAuth.organization.id !== input.organizationId
    || unexpectedBlockedDrift
  ) {
    fail('reconciliation_evidence_mismatch', 409, 'Reconciliation evidence does not match this immutable replay request.')
  }
  const activeProviderSubscriptions = report.provider.subscriptions.filter(subscription => subscription.status === 'active')
  const activeBetterAuthSubscriptions = report.betterAuth.subscriptions.filter(subscription => subscription.status === 'active')
  if (
    activeProviderSubscriptions.length !== 1
    || activeBetterAuthSubscriptions.length !== 1
    || activeProviderSubscriptions[0]?.id !== retained.subscriptionId
    || activeBetterAuthSubscriptions[0]?.stripeSubscriptionId !== retained.subscriptionId
  ) {
    fail('subscription_evidence_mismatch', 409, 'Exactly one active Stripe and Better Auth subscription must match the retained event.')
  }
  const provider = activeProviderSubscriptions[0]
  const betterAuth = activeBetterAuthSubscriptions[0]
  const invoice = provider?.latestInvoice
  const baseLine = invoice?.baseLine
  if (
    provider?.canonicalPlan !== 'growth'
    || provider.quantity !== 1
    || provider.metadata.ownerMetadataConflict
    || provider.metadata.ownerId !== input.organizationId
    || betterAuth?.plan !== 'growth'
    || betterAuth.ownerMetadataConflict
    || betterAuth.referenceId !== input.organizationId
    || provider.customerId !== organization.stripe_customer_id
    || betterAuth.stripeCustomerId !== organization.stripe_customer_id
    || betterAuth.periodEnd !== provider.periodEnd
    || organization.access_expires_at !== provider.periodEnd
    || organization.stripe_subscription_id !== retained.subscriptionId
    || invoice?.id !== retained.invoiceId
    || provider.latestInvoiceId !== retained.invoiceId
    || invoice.subscriptionId !== retained.subscriptionId
    || invoice.status !== 'paid'
    || !invoice.linesComplete
    || !provider.canonicalBasePriceId
    || !provider.canonicalBaseItemId
    || !baseLine
    || baseLine.subscriptionId !== retained.subscriptionId
    || baseLine.subscriptionItemId !== provider.canonicalBaseItemId
    || baseLine.priceId !== provider.canonicalBasePriceId
    || baseLine.quantity !== 1
    || baseLine.proration
    || !baseLine.subscriptionLine
  ) {
    fail('provider_evidence_invalid', 409, 'Stripe reconciliation lacks exact paid canonical invoice-line evidence for this replay.')
  }
  const periodStart = exactIso(baseLine.periodStart, 'Provider invoice base-line period start')
  const periodEnd = exactIso(baseLine.periodEnd, 'Provider invoice base-line period end')
  const providerPeriodEnd = exactIso(provider.periodEnd, 'Provider subscription period end')
  if (Date.parse(periodStart) >= Date.parse(periodEnd) || Date.parse(periodEnd) < Date.parse(providerPeriodEnd)) {
    fail('provider_evidence_invalid', 409, 'Provider invoice base-line period does not cover the active subscription period.')
  }
  return {
    basePlanPriceId: provider.canonicalBasePriceId,
    periodStart,
    periodEnd,
  }
}

async function readReplayEvidence(
  db: DbClient,
  input: StripeProcessedInvoiceReplayInput,
  actor: string,
  report: OrganizationSubscriptionReconciliationReport,
  now: Date,
): Promise<ReplayEvidence> {
  const eventRow = await readEventRow(db, input.stripeEventId)
  const retained = parseRetainedInvoicePaidEvent(eventRow, now)
  if (retained.livemode !== (input.providerMode === 'live')) {
    fail('provider_mode_mismatch', 409, 'Retained event livemode does not match the requested provider mode.')
  }
  const [invoice, organization, quota] = await Promise.all([
    readInvoiceRow(db, retained.invoiceId),
    readOrganizationRow(db, input.organizationId),
    readQuotaSnapshot(db, input.organizationId),
  ])
  if (
    invoice.organization_id !== input.organizationId
    || invoice.stripe_subscription_id !== retained.subscriptionId
    || invoice.stripe_invoice_id !== retained.invoiceId
    || invoice.status !== 'paid'
    || organization.organization_id !== input.organizationId
    || organization.access_plan !== 'growth'
    || organization.stripe_subscription_id !== retained.subscriptionId
  ) {
    fail('local_evidence_mismatch', 409, 'Local invoice or organization billing evidence does not match the retained event.')
  }
  const repair = validateProviderEvidence(report, input, actor, retained, organization)
  if (invoice.base_plan_price_id !== null) {
    if (
      invoice.base_plan_price_id !== repair.basePlanPriceId
      || invoice.period_start !== repair.periodStart
      || invoice.period_end !== repair.periodEnd
    ) {
      fail(
        'local_evidence_not_repairable',
        409,
        'Existing non-null invoice evidence differs from the verified provider line and cannot be enriched by replay.',
      )
    }
  } else if (invoice.period_end !== null) {
    const existingPeriodEnd = Date.parse(invoice.period_end)
    if (!Number.isFinite(existingPeriodEnd) || existingPeriodEnd > Date.parse(repair.periodEnd)) {
      fail(
        'local_evidence_not_repairable',
        409,
        'Existing invoice period evidence cannot be safely enriched by replay.',
      )
    }
  }
  return {
    eventRow,
    retained,
    invoice,
    organization,
    quota,
    payloadSha256: await sha256Text(eventRow.payload ?? ''),
    repair,
  }
}

function processedStateIsClean(row: StripeWebhookEventRow): boolean {
  return row.status === 'processed'
    && row.error === null
    && row.claimed_at === null
    && row.lease_expires_at === null
    && row.claim_token === null
    && row.next_attempt_at === null
    && row.dead_lettered_at === null
    && row.attempt_count < MAX_STRIPE_WEBHOOK_ATTEMPTS
}

function replayIsAlreadyQueued(row: StripeWebhookEventRow): boolean {
  return (row.status === 'pending' || row.status === 'failed')
    && row.attempt_count < MAX_STRIPE_WEBHOOK_ATTEMPTS
    && row.dead_lettered_at === null
}

function replayIsAlreadyApplied(evidence: ReplayEvidence): boolean {
  const paidThrough = evidence.organization.paid_through
  return evidence.eventRow.status === 'processed'
    && evidence.invoice.base_plan_price_id === evidence.repair.basePlanPriceId
    && evidence.invoice.period_start === evidence.repair.periodStart
    && evidence.invoice.period_end === evidence.repair.periodEnd
    && evidence.organization.payment_status === 'paid'
    && evidence.organization.last_paid_invoice_id === evidence.retained.invoiceId
    && Boolean(paidThrough && Date.parse(paidThrough) >= Date.parse(evidence.repair.periodEnd))
}

async function replayStateDigest(
  evidence: ReplayEvidence,
  input: StripeProcessedInvoiceReplayInput,
  report: OrganizationSubscriptionReconciliationReport,
): Promise<string> {
  return await sha256CanonicalJson({
    request: input,
    reconciliationReportSha256: report.reportSha256,
    event: {
      id: evidence.eventRow.id,
      stripeEventId: evidence.eventRow.stripe_event_id,
      eventType: evidence.eventRow.event_type,
      status: evidence.eventRow.status,
      payloadSha256: evidence.payloadSha256,
      error: evidence.eventRow.error,
      claimedAt: evidence.eventRow.claimed_at,
      leaseExpiresAt: evidence.eventRow.lease_expires_at,
      claimToken: evidence.eventRow.claim_token,
      nextAttemptAt: evidence.eventRow.next_attempt_at,
      attemptCount: evidence.eventRow.attempt_count,
      deadLetteredAt: evidence.eventRow.dead_lettered_at,
      createdAt: evidence.eventRow.created_at,
    },
    invoice: evidence.invoice,
    organization: evidence.organization,
    quota: evidence.quota,
    repair: evidence.repair,
  })
}

function approvalRequest(
  input: StripeProcessedInvoiceReplayInput,
  report: OrganizationSubscriptionReconciliationReport,
  evidence: ReplayEvidence,
) {
  return {
    input,
    reconciliationReportSha256: report.reportSha256,
    payloadSha256: evidence.payloadSha256,
    repair: evidence.repair,
  }
}

function mapApprovalError(error: unknown): never {
  if (error instanceof OperatorApprovalError) {
    fail(error.code, error.statusCode, error.message)
  }
  throw error
}

function alreadyAppliedResult(evidence: ReplayEvidence): Extract<
  StripeProcessedInvoiceReplayApplyResult,
  { status: 'already_applied' }
> {
  return {
    status: 'already_applied',
    stripeEventId: evidence.eventRow.stripe_event_id,
    invoiceId: evidence.retained.invoiceId,
    paidThrough: evidence.organization.paid_through as string,
  }
}

export async function previewStripeProcessedInvoiceReplay(
  db: DbClient,
  secret: string,
  input: StripeProcessedInvoiceReplayInput,
  actor: string,
  report: OrganizationSubscriptionReconciliationReport,
  now = new Date(),
): Promise<StripeProcessedInvoiceReplayPreviewResult> {
  const evidence = await readReplayEvidence(db, input, actor, report, now)
  if (replayIsAlreadyApplied(evidence)) return alreadyAppliedResult(evidence)
  if (!processedStateIsClean(evidence.eventRow)) {
    if (replayIsAlreadyQueued(evidence.eventRow)) {
      fail('already_queued', 409, 'Processed invoice replay is already queued for normal Stripe reconciliation.')
    }
    fail('invalid_state', 409, 'Stripe invoice event is not a clean processed replay candidate.')
  }
  const expectedStateSha256 = await replayStateDigest(evidence, input, report)
  const expiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS).toISOString()
  let approvalToken: string
  try {
    approvalToken = await createOperatorApprovalToken(secret, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, report, evidence),
      expectedStateSha256,
      expiresAt,
    })
  } catch (error) {
    mapApprovalError(error)
  }
  const plan: StripeProcessedInvoiceReplayPlan = {
    schemaVersion: 1,
    kind: 'stripe-processed-invoice-replay',
    actor,
    input,
    reconciliation: {
      reportSha256: report.reportSha256,
      status: report.status,
      driftCodes: [...new Set(report.drifts.map(drift => drift.code))].sort(),
    },
    event: {
      stripeEventId: evidence.eventRow.stripe_event_id,
      invoiceId: evidence.retained.invoiceId,
      subscriptionId: evidence.retained.subscriptionId,
      livemode: evidence.retained.livemode,
      status: evidence.eventRow.status as string,
      attemptCount: evidence.eventRow.attempt_count,
      createdAt: evidence.eventRow.created_at,
    },
    invoiceBefore: {
      basePlanPriceId: evidence.invoice.base_plan_price_id,
      periodStart: evidence.invoice.period_start,
      periodEnd: evidence.invoice.period_end,
      lastEventId: evidence.invoice.last_event_id,
    },
    organizationBefore: {
      paymentStatus: evidence.organization.payment_status,
      paidThrough: evidence.organization.paid_through,
      lastPaidInvoiceId: evidence.organization.last_paid_invoice_id,
    },
    quotaBefore: evidence.quota,
    repair: evidence.repair,
    payloadSha256: evidence.payloadSha256,
    expectedStateSha256,
    expiresAt,
    approvalToken,
  }
  console.info(JSON.stringify({
    message: 'stripe_processed_invoice_replay_operator',
    mode: 'preview',
    actor,
    organizationId: input.organizationId,
    stripeEventId: input.stripeEventId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    reportSha256: report.reportSha256,
    expectedStateSha256,
  }))
  return { status: 'preview', plan }
}

export async function applyStripeProcessedInvoiceReplay(
  db: DbClient,
  secret: string,
  input: StripeProcessedInvoiceReplayInput,
  actor: string,
  report: OrganizationSubscriptionReconciliationReport,
  expectedStateSha256: string,
  approvalToken: string,
  now = new Date(),
): Promise<StripeProcessedInvoiceReplayApplyResult> {
  if (!/^[0-9a-f]{64}$/u.test(expectedStateSha256)) {
    fail('invalid_request', 400, 'expectedStateSha256 must be a lowercase SHA-256 digest.')
  }
  const evidence = await readReplayEvidence(db, input, actor, report, now)
  if (replayIsAlreadyApplied(evidence)) return alreadyAppliedResult(evidence)
  if (replayIsAlreadyQueued(evidence.eventRow)) {
    return {
      status: 'already_queued',
      stripeEventId: input.stripeEventId,
      invoiceId: evidence.retained.invoiceId,
      attemptCount: evidence.eventRow.attempt_count,
    }
  }
  if (!processedStateIsClean(evidence.eventRow)) {
    fail('invalid_state', 409, 'Stripe invoice event is not a clean processed replay candidate.')
  }
  const currentStateSha256 = await replayStateDigest(evidence, input, report)
  if (currentStateSha256 !== expectedStateSha256) {
    fail('stale_state', 409, 'Processed invoice replay state changed after review.')
  }
  try {
    await verifyOperatorApprovalToken(secret, approvalToken, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, report, evidence),
      expectedStateSha256,
      now,
    })
  } catch (error) {
    mapApprovalError(error)
  }

  const updated = await execute(db, `
    UPDATE stripe_webhook_events
       SET status = 'pending', error = NULL,
           claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
           next_attempt_at = NULL, dead_lettered_at = NULL
     WHERE id = ?
       AND stripe_event_id = ?
       AND event_type = 'invoice.paid'
       AND status = 'processed'
       AND payload = ?
       AND error IS ?
       AND claimed_at IS ?
       AND lease_expires_at IS ?
       AND claim_token IS ?
       AND next_attempt_at IS ?
       AND attempt_count = ?
       AND dead_lettered_at IS ?
       AND created_at = ?
       AND EXISTS (
         SELECT 1
           FROM stripe_invoice_payments sip
          WHERE sip.stripe_invoice_id = ?
            AND sip.organization_id = ?
            AND sip.stripe_subscription_id = ?
            AND sip.base_plan_price_id IS ?
            AND sip.status IS ?
            AND sip.period_start IS ?
            AND sip.period_end IS ?
            AND sip.last_event_created IS ?
            AND sip.last_event_id IS ?
       )
       AND EXISTS (
         SELECT 1
           FROM organization_billing ob
          WHERE ob.organization_id = ?
            AND ob.stripe_customer_id IS ?
            AND ob.stripe_subscription_id IS ?
            AND ob.access_plan IS ?
            AND ob.access_expires_at IS ?
            AND ob.payment_status IS ?
            AND ob.paid_through IS ?
            AND ob.past_due_since IS ?
            AND ob.last_paid_invoice_id IS ?
            AND ob.last_payment_event_created IS ?
            AND ob.last_payment_event_id IS ?
            AND ob.updated_at IS ?
       )
  `, [
    evidence.eventRow.id,
    evidence.eventRow.stripe_event_id,
    evidence.eventRow.payload,
    evidence.eventRow.error,
    evidence.eventRow.claimed_at,
    evidence.eventRow.lease_expires_at,
    evidence.eventRow.claim_token,
    evidence.eventRow.next_attempt_at,
    evidence.eventRow.attempt_count,
    evidence.eventRow.dead_lettered_at,
    evidence.eventRow.created_at,
    evidence.invoice.stripe_invoice_id,
    evidence.invoice.organization_id,
    evidence.invoice.stripe_subscription_id,
    evidence.invoice.base_plan_price_id,
    evidence.invoice.status,
    evidence.invoice.period_start,
    evidence.invoice.period_end,
    evidence.invoice.last_event_created,
    evidence.invoice.last_event_id,
    evidence.organization.organization_id,
    evidence.organization.stripe_customer_id,
    evidence.organization.stripe_subscription_id,
    evidence.organization.access_plan,
    evidence.organization.access_expires_at,
    evidence.organization.payment_status,
    evidence.organization.paid_through,
    evidence.organization.past_due_since,
    evidence.organization.last_paid_invoice_id,
    evidence.organization.last_payment_event_created,
    evidence.organization.last_payment_event_id,
    evidence.organization.updated_at,
  ])
  if (Number(updated?.meta.changes ?? 0) !== 1) {
    const after = await readEventRow(db, input.stripeEventId)
    if (replayIsAlreadyQueued(after) && after.payload === evidence.eventRow.payload) {
      return {
        status: 'already_queued',
        stripeEventId: input.stripeEventId,
        invoiceId: evidence.retained.invoiceId,
        attemptCount: after.attempt_count,
      }
    }
    fail('stale_state', 409, 'Processed invoice replay state changed during apply.')
  }
  console.info(JSON.stringify({
    message: 'stripe_processed_invoice_replay_operator',
    mode: 'apply',
    status: 'queued',
    actor,
    organizationId: input.organizationId,
    stripeEventId: input.stripeEventId,
    invoiceId: evidence.retained.invoiceId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    reportSha256: report.reportSha256,
    expectedStateSha256,
  }))
  return {
    status: 'queued',
    stripeEventId: input.stripeEventId,
    invoiceId: evidence.retained.invoiceId,
    attemptCount: evidence.eventRow.attempt_count,
  }
}
