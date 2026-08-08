import { executeBatch, queryFirst, type DbClient } from '~/server/db'
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

const APPROVAL_WINDOW_MS = 10 * 60 * 1000
const RETAINED_PAYLOAD_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const APPROVAL_PURPOSE = 'stripe_dead_letter_requeue' as const

export type StripeDeadLetterRequeueMode = 'preview' | 'apply'

export interface StripeDeadLetterRequeueInput {
  stripeEventId: string
  reason: string
  idempotencyKey: string
}

export interface ParsedStripeDeadLetterRequeueRequest {
  mode: StripeDeadLetterRequeueMode
  input: StripeDeadLetterRequeueInput
  expectedStateSha256?: string
  approvalToken?: string
}

export interface StripeDeadLetterRequeuePreview {
  actor: string
  input: StripeDeadLetterRequeueInput
  event: {
    stripeEventId: string
    eventType: string
    livemode: boolean
    createdAt: string
    deadLetteredAt: string | null
    attemptCount: number
  }
  payloadSha256: string
  expectedStateSha256: string
  expiresAt: string
  approvalToken: string
}

export type StripeDeadLetterRequeueResult = {
  status: 'applied' | 'already_requeued'
  stripeEventId: string
}

export class StripeDeadLetterRequeueError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, statusCode: number, message: string) {
    super(message)
    this.name = 'StripeDeadLetterRequeueError'
    this.code = code
    this.statusCode = statusCode
  }
}

interface StripeDeadLetterRow {
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

interface StripeEventShape {
  id: string
  type: string
  livemode: boolean
}

type ApprovalRequest = {
  input: StripeDeadLetterRequeueInput
  payloadSha256: string
  eventType: string | null
}

function fail(code: string, statusCode: number, message: string): never {
  throw new StripeDeadLetterRequeueError(code, statusCode, message)
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
  if (unknown.length > 0) fail('invalid_request', 400, `Unsupported Stripe dead-letter field: ${unknown[0]}`)
}

export function parseStripeDeadLetterRequeueRequest(body: unknown): ParsedStripeDeadLetterRequeueRequest {
  if (!isRecord(body)) fail('invalid_request', 400, 'A Stripe dead-letter requeue body is required.')

  const mode = body.mode === undefined ? 'preview' : body.mode
  if (mode !== 'preview' && mode !== 'apply') {
    fail('invalid_request', 400, 'mode must be preview or apply.')
  }
  const allowed = new Set(['stripeEventId', 'reason', 'idempotencyKey', 'mode'])
  if (mode === 'apply') {
    allowed.add('expectedStateSha256')
    allowed.add('approvalToken')
  }
  rejectUnknownFields(body, allowed)

  const parsed: ParsedStripeDeadLetterRequeueRequest = {
    mode,
    input: {
      stripeEventId: requiredString(body.stripeEventId, 'stripeEventId', 255),
      reason: requiredString(body.reason, 'reason', 1000),
      idempotencyKey: requiredString(body.idempotencyKey, 'idempotencyKey', 200),
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

export function assertStripeDeadLetterOperatorSession(session: unknown): string {
  try {
    return assertDirectOperatorSession(session)
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      fail(
        error.code,
        error.statusCode,
        error.code === 'impersonation_forbidden'
          ? 'Stripe dead-letter requeue cannot run in an impersonation session.'
          : error.message,
      )
    }
    throw error
  }
}

function mapApprovalError(error: unknown): never {
  if (error instanceof OperatorApprovalError) {
    fail(
      error.code,
      error.statusCode,
      error.code === 'configuration_error'
        ? 'BETTER_AUTH_SECRET is required for Stripe dead-letter approvals.'
        : error.message,
    )
  }
  throw error
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function payloadDigest(payload: string | null): Promise<string> {
  return await sha256Text(payload ?? '')
}

function validateRowShape(row: StripeDeadLetterRow): void {
  if (!row.id || !row.stripe_event_id || !row.created_at || !Number.isSafeInteger(Number(row.attempt_count))) {
    fail('state_invalid', 500, 'Stripe dead-letter state is malformed.')
  }
}

function parseRetainedStripeEvent(row: StripeDeadLetterRow, now: Date): StripeEventShape {
  const createdAt = Date.parse(row.created_at)
  if (!Number.isFinite(createdAt) || createdAt < now.getTime() - RETAINED_PAYLOAD_WINDOW_MS) {
    fail(
      'payload_expired',
      409,
      'The retained Stripe event payload is outside the 90-day retention window; a provider refresh would require separate approval.',
    )
  }
  if (typeof row.payload !== 'string' || row.payload.length === 0) {
    fail(
      'payload_missing',
      409,
      'The retained Stripe event payload is unavailable; a provider refresh would require separate approval.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(row.payload)
  } catch {
    fail(
      'payload_malformed',
      409,
      'The retained Stripe event payload is not valid JSON; a provider refresh would require separate approval.',
    )
  }
  if (!isRecord(parsed)) {
    fail(
      'payload_malformed',
      409,
      'The retained Stripe event payload is not a Stripe event object; a provider refresh would require separate approval.',
    )
  }
  if (
    typeof parsed.id !== 'string'
    || parsed.id !== row.stripe_event_id
    || typeof parsed.type !== 'string'
    || !parsed.type
    || parsed.type !== row.event_type
    || typeof parsed.livemode !== 'boolean'
  ) {
    fail(
      'payload_mismatch',
      409,
      'The retained Stripe event payload does not match its stored event identity; a provider refresh would require separate approval.',
    )
  }
  return {
    id: parsed.id,
    type: parsed.type,
    livemode: parsed.livemode,
  }
}

function cleanPendingState(row: StripeDeadLetterRow): boolean {
  return row.status === 'pending'
    && row.error === null
    && row.claimed_at === null
    && row.lease_expires_at === null
    && row.claim_token === null
    && row.next_attempt_at === null
    && Number(row.attempt_count) === 0
    && row.dead_lettered_at === null
}

async function stateDigest(row: StripeDeadLetterRow, payloadSha256: string): Promise<string> {
  return await sha256CanonicalJson({
    id: row.id,
    stripeEventId: row.stripe_event_id,
    eventType: row.event_type,
    status: row.status,
    payloadSha256,
    error: row.error,
    claimedAt: row.claimed_at,
    leaseExpiresAt: row.lease_expires_at,
    claimToken: row.claim_token,
    nextAttemptAt: row.next_attempt_at,
    attemptCount: Number(row.attempt_count),
    deadLetteredAt: row.dead_lettered_at,
    createdAt: row.created_at,
  })
}

async function readRow(db: DbClient, stripeEventId: string): Promise<StripeDeadLetterRow> {
  const row = await queryFirst<StripeDeadLetterRow>(db, `
    SELECT id, stripe_event_id, event_type, status, payload, error,
           claimed_at, lease_expires_at, claim_token, next_attempt_at,
           attempt_count, dead_lettered_at, created_at
    FROM stripe_webhook_events
    WHERE stripe_event_id = ?
    LIMIT 1
  `, [stripeEventId])
  if (!row) fail('not_found', 404, 'Stripe dead-letter event was not found.')
  validateRowShape(row)
  return row
}

function approvalRequest(
  input: StripeDeadLetterRequeueInput,
  payloadSha256: string,
  eventType: string | null,
): ApprovalRequest {
  return { input, payloadSha256, eventType }
}

export async function previewStripeDeadLetterRequeue(
  db: DbClient,
  secret: string,
  input: StripeDeadLetterRequeueInput,
  actor: string,
  now = new Date(),
): Promise<StripeDeadLetterRequeuePreview> {
  const row = await readRow(db, input.stripeEventId)
  if (row.status !== 'dead_letter') {
    fail('invalid_state', 409, 'Stripe event is not currently dead-lettered.')
  }
  const event = parseRetainedStripeEvent(row, now)
  const payloadSha256 = await payloadDigest(row.payload)
  const expectedStateSha256 = await stateDigest(row, payloadSha256)
  const expiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS).toISOString()
  let approvalToken: string
  try {
    approvalToken = await createOperatorApprovalToken(secret, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, payloadSha256, row.event_type),
      expectedStateSha256,
      expiresAt,
    })
  } catch (error) {
    mapApprovalError(error)
  }

  console.info('stripe_dead_letter_requeue_operator', {
    mode: 'preview',
    actor,
    stripeEventId: input.stripeEventId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  })
  return {
    actor,
    input,
    event: {
      stripeEventId: row.stripe_event_id,
      eventType: event.type,
      livemode: event.livemode,
      createdAt: row.created_at,
      deadLetteredAt: row.dead_lettered_at,
      attemptCount: Number(row.attempt_count),
    },
    payloadSha256,
    expectedStateSha256,
    expiresAt,
    approvalToken,
  }
}

async function verifyApproval(
  secret: string,
  token: string,
  actor: string,
  input: StripeDeadLetterRequeueInput,
  payloadSha256: string,
  eventType: string | null,
  expectedStateSha256: string,
  now: Date,
): Promise<void> {
  try {
    await verifyOperatorApprovalToken(secret, token, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, payloadSha256, eventType),
      expectedStateSha256,
      now,
    })
  } catch (error) {
    mapApprovalError(error)
  }
}

export async function applyStripeDeadLetterRequeue(
  db: DbClient,
  secret: string,
  input: StripeDeadLetterRequeueInput,
  actor: string,
  expectedStateSha256: string,
  approvalToken: string,
  now = new Date(),
): Promise<StripeDeadLetterRequeueResult> {
  if (!/^[0-9a-f]{64}$/u.test(expectedStateSha256)) {
    fail('invalid_request', 400, 'expectedStateSha256 must be a lowercase SHA-256 digest.')
  }
  const row = await readRow(db, input.stripeEventId)
  const payloadSha256 = await payloadDigest(row.payload)
  await verifyApproval(secret, approvalToken, actor, input, payloadSha256, row.event_type, expectedStateSha256, now)

  if (cleanPendingState(row)) {
    console.info('stripe_dead_letter_requeue_operator', {
      mode: 'apply',
      status: 'already_requeued',
      actor,
      stripeEventId: input.stripeEventId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    })
    return { status: 'already_requeued', stripeEventId: input.stripeEventId }
  }
  if (row.status !== 'dead_letter') {
    fail('stale_state', 409, 'Stripe dead-letter state changed after review.')
  }

  const currentStateSha256 = await stateDigest(row, payloadSha256)
  if (currentStateSha256 !== expectedStateSha256) {
    fail('stale_state', 409, 'Stripe dead-letter state changed after review.')
  }

  const updated = await executeBatch(db, [{
    query: `
      UPDATE stripe_webhook_events
      SET status = 'pending', error = NULL,
          claimed_at = NULL, lease_expires_at = NULL, claim_token = NULL,
          next_attempt_at = NULL, attempt_count = 0, dead_lettered_at = NULL
      WHERE id = ?
        AND stripe_event_id = ?
        AND status = 'dead_letter'
        AND event_type IS ?
        AND payload IS ?
        AND error IS ?
        AND claimed_at IS ?
        AND lease_expires_at IS ?
        AND claim_token IS ?
        AND next_attempt_at IS ?
        AND attempt_count = ?
        AND dead_lettered_at IS ?
        AND created_at IS ?
    `,
    params: [
      row.id,
      row.stripe_event_id,
      row.event_type,
      row.payload,
      row.error,
      row.claimed_at,
      row.lease_expires_at,
      row.claim_token,
      row.next_attempt_at,
      Number(row.attempt_count),
      row.dead_lettered_at,
      row.created_at,
    ],
  }])
  if (Number(updated[0]?.meta?.changes ?? 0) !== 1) {
    const after = await readRow(db, input.stripeEventId)
    if (cleanPendingState(after) && after.payload === row.payload && after.event_type === row.event_type) {
      console.info('stripe_dead_letter_requeue_operator', {
        mode: 'apply',
        status: 'already_requeued',
        actor,
        stripeEventId: input.stripeEventId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      })
      return { status: 'already_requeued', stripeEventId: input.stripeEventId }
    }
    fail('stale_state', 409, 'Stripe dead-letter state changed after review.')
  }

  console.info('stripe_dead_letter_requeue_operator', {
    mode: 'apply',
    status: 'applied',
    actor,
    stripeEventId: input.stripeEventId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  })
  return { status: 'applied', stripeEventId: input.stripeEventId }
}
