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
import { getAiQuotaStatus } from '~/server/utils/ai-credits'

const APPROVAL_WINDOW_MS = 10 * 60 * 1000
const APPROVAL_PURPOSE = 'quota_adjustment' as const
const ADJUSTMENT_RESOURCE = 'ai_inference' as const
const ADJUSTMENT_UNIT = 'credit' as const

export type QuotaAdjustmentAction = 'manual' | 'reset'
export type QuotaAdjustmentMode = 'preview' | 'apply'

export interface QuotaAdjustmentInput {
  organizationId: string
  action: QuotaAdjustmentAction
  quantity: number
  reason: string
  idempotencyKey: string
}

export interface ParsedQuotaAdjustmentRequest {
  mode: QuotaAdjustmentMode
  input: QuotaAdjustmentInput
  expectedStateSha256?: string
  approvalToken?: string
}

export interface QuotaAdjustmentPeriod {
  key: string
  start: string
  end: string
}

export interface QuotaAdjustmentState {
  credits: {
    balance: number
    lifetimeUsed: number
    balancePeriodKey: string | null
    updatedAt: string
  }
  grants: {
    count: number
    quantity: number
    appliedCount: number
    latestCreatedAt: string | null
  }
  usage: {
    count: number
    quantity: number
    latestCreatedAt: string | null
  }
}

export interface QuotaAdjustmentPlan {
  actor: string
  input: QuotaAdjustmentInput
  period: QuotaAdjustmentPeriod
  state: QuotaAdjustmentState
  expectedStateSha256: string
  expiresAt: string
  approvalToken: string
}

/**
 * Better Auth is the source of truth for organization identity. Quota ledger
 * rows remain app-owned, so callers pass the canonical Organization adapter
 * lookup explicitly instead of letting this utility query Better Auth tables.
 */
export interface QuotaAdjustmentOrganizationLookup {
  findOrganizationById(_organizationId: string): Promise<unknown>
}

export type QuotaAdjustmentResult =
  | { status: 'applied'; organizationId: string; action: QuotaAdjustmentAction; quantity: number; grantId: string; period: QuotaAdjustmentPeriod }
  | { status: 'already_applied'; organizationId: string; action: QuotaAdjustmentAction; quantity: number; grantId: string; period: QuotaAdjustmentPeriod }

export class QuotaAdjustmentError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, statusCode: number, message: string) {
    super(message)
    this.name = 'QuotaAdjustmentError'
    this.code = code
    this.statusCode = statusCode
  }
}

interface AggregateRow {
  count: unknown
  quantity: unknown
  invalid_count: unknown
  applied_count?: unknown
  latest_created_at: unknown
}

interface ExistingGrantRow {
  id: string
  resource: string
  quantity: unknown
  unit: string
  period_key: string
  period_start: string
  period_end: string | null
  grant_type: string
  reason: string
  created_by: string | null
  idempotency_key: string
  applied_at: unknown
}

interface QuotaAdjustmentSnapshot {
  state: QuotaAdjustmentState
  existingGrant: ExistingGrantRow | null
}

type ApprovalRequest = {
  input: QuotaAdjustmentInput
  period: QuotaAdjustmentPeriod
}

async function assertQuotaOrganization(
  organizationLookup: QuotaAdjustmentOrganizationLookup,
  organizationId: string,
): Promise<void> {
  if (!organizationLookup || typeof organizationLookup.findOrganizationById !== 'function') {
    fail('organization_lookup_unavailable', 500, 'Organization identity could not be verified.')
  }

  const organization = await organizationLookup.findOrganizationById(organizationId)
  if (!organization || typeof organization !== 'object' || Array.isArray(organization)) {
    fail('organization_not_found', 404, 'Organization not found.')
  }
  const id = (organization as { id?: unknown }).id
  if (id !== organizationId) {
    fail('organization_not_found', 404, 'Organization not found.')
  }
}

function fail(code: string, statusCode: number, message: string): never {
  throw new QuotaAdjustmentError(code, statusCode, message)
}

function quotaStateInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('quota_state_invalid', 500, `${label} must be a non-negative safe integer.`)
  }
  return value
}

function quotaStateTimestamp(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    fail('quota_state_invalid', 500, `${label} must be a valid timestamp.`)
  }
  return value
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
  if (unknown.length > 0) fail('invalid_request', 400, `Unsupported quota adjustment field: ${unknown[0]}`)
}

export function parseQuotaAdjustmentRequest(body: unknown): ParsedQuotaAdjustmentRequest {
  if (!isRecord(body)) fail('invalid_request', 400, 'A quota adjustment body is required.')

  const mode = body.mode === undefined ? 'preview' : body.mode
  if (mode !== 'preview' && mode !== 'apply') fail('invalid_request', 400, 'mode must be preview or apply.')
  const allowed = new Set(['organizationId', 'action', 'quantity', 'reason', 'idempotencyKey', 'mode'])
  if (mode === 'apply') {
    allowed.add('expectedStateSha256')
    allowed.add('approvalToken')
  }
  rejectUnknownFields(body, allowed)

  const organizationId = requiredString(body.organizationId, 'organizationId', 128)
  const reason = requiredString(body.reason, 'reason', 1000)
  const idempotencyKey = requiredString(body.idempotencyKey, 'idempotencyKey', 200)
  if (body.action !== 'manual' && body.action !== 'reset') fail('invalid_request', 400, 'action must be manual or reset.')
  if (typeof body.quantity !== 'number' || !Number.isSafeInteger(body.quantity) || body.quantity < 0) {
    fail('invalid_request', 400, 'quantity must be a non-negative safe integer.')
  }

  const parsed: ParsedQuotaAdjustmentRequest = {
    mode,
    input: {
      organizationId,
      action: body.action,
      quantity: body.quantity,
      reason,
      idempotencyKey,
    },
  }
  if (mode === 'apply') {
    const expectedStateSha256 = requiredString(body.expectedStateSha256, 'expectedStateSha256', 64)
    if (!/^[0-9a-f]{64}$/.test(expectedStateSha256)) {
      fail('invalid_request', 400, 'expectedStateSha256 must be a lowercase SHA-256 digest.')
    }
    parsed.expectedStateSha256 = expectedStateSha256
    parsed.approvalToken = requiredString(body.approvalToken, 'approvalToken', 4096)
  }
  return parsed
}

export function assertQuotaOperatorSession(session: unknown): string {
  try {
    return assertDirectOperatorSession(session)
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      fail(
        error.code,
        error.statusCode,
        error.code === 'impersonation_forbidden'
          ? 'Quota adjustments cannot run in an impersonation session.'
          : error.message,
      )
    }
    throw error
  }
}

function currentPeriod(now: Date): QuotaAdjustmentPeriod {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const daysFromMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysFromMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  const weekKey = start.toISOString().slice(0, 10)
  return {
    key: `week:${weekKey}`,
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function balancePeriodKey(period: QuotaAdjustmentPeriod): string {
  return period.key.slice('week:'.length)
}

function mapOperatorApprovalError(error: unknown): never {
  if (error instanceof OperatorApprovalError) {
    fail(
      error.code,
      error.statusCode,
      error.code === 'configuration_error'
        ? 'BETTER_AUTH_SECRET is required for quota approvals.'
        : error.message,
    )
  }
  throw error
}

function approvalRequest(input: QuotaAdjustmentInput, period: QuotaAdjustmentPeriod): ApprovalRequest {
  return { input, period }
}

async function readSnapshot(
  db: DbClient,
  input: QuotaAdjustmentInput,
  period: QuotaAdjustmentPeriod,
  organizationLookup: QuotaAdjustmentOrganizationLookup,
): Promise<QuotaAdjustmentSnapshot> {
  await assertQuotaOrganization(organizationLookup, input.organizationId)
  const quota = await getAiQuotaStatus(db, input.organizationId, null, new Date(period.start))
  const balance = quotaStateInteger(quota.balance, 'AI quota balance')
  const lifetimeUsed = quotaStateInteger(quota.lifetimeUsed, 'AI quota lifetime usage')

  const grants = await queryFirst<AggregateRow>(db, `
    SELECT COUNT(*) AS count,
           COALESCE(SUM(quantity), 0) AS quantity,
           COALESCE(SUM(CASE
             WHEN typeof(quantity) != 'integer'
               OR quantity < 0
               OR quantity > 9007199254740991
             THEN 1 ELSE 0 END), 0) AS invalid_count,
           COALESCE(SUM(CASE WHEN applied_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS applied_count,
           MAX(created_at) AS latest_created_at
    FROM usage_quota_grants
    WHERE organization_id = ?
      AND resource = 'ai_inference'
      AND unit = 'credit'
      AND period_start = ?
      AND period_end = ?
  `, [input.organizationId, period.start, period.end])
  const usage = await queryFirst<AggregateRow>(db, `
    SELECT COUNT(*) AS count,
           COALESCE(SUM(quantity), 0) AS quantity,
           COALESCE(SUM(CASE
             WHEN typeof(quantity) != 'integer'
               OR quantity < 0
               OR quantity > 9007199254740991
             THEN 1 ELSE 0 END), 0) AS invalid_count,
           MAX(created_at) AS latest_created_at
    FROM usage_events
    WHERE organization_id = ?
      AND resource = 'ai_inference'
      AND unit = 'credit'
      AND created_at >= ?
      AND created_at < ?
  `, [input.organizationId, period.start, period.end])
  const existingGrant = await queryFirst<ExistingGrantRow>(db, `
    SELECT id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, idempotency_key, applied_at
    FROM usage_quota_grants
    WHERE organization_id = ? AND idempotency_key = ?
    LIMIT 1
  `, [input.organizationId, input.idempotencyKey])

  const grantCount = quotaStateInteger(grants?.count ?? 0, 'Quota grant count')
  const invalidGrantCount = quotaStateInteger(grants?.invalid_count ?? 0, 'Invalid quota grant count')
  if (invalidGrantCount !== 0) {
    fail('quota_state_invalid', 500, 'Quota grants contain invalid quantity state.')
  }
  const grantQuantity = quotaStateInteger(grants?.quantity ?? 0, 'Quota grant quantity total')
  const appliedGrantCount = quotaStateInteger(grants?.applied_count ?? 0, 'Applied quota grant count')
  if (appliedGrantCount > grantCount) {
    fail('quota_state_invalid', 500, 'Applied quota grant count cannot exceed the grant count.')
  }
  const usageCount = quotaStateInteger(usage?.count ?? 0, 'Usage event count')
  const invalidUsageCount = quotaStateInteger(usage?.invalid_count ?? 0, 'Invalid usage event count')
  if (invalidUsageCount !== 0) {
    fail('quota_state_invalid', 500, 'Usage events contain invalid quantity state.')
  }
  const usageQuantity = quotaStateInteger(usage?.quantity ?? 0, 'Usage event quantity total')
  const latestGrantCreatedAt = quotaStateTimestamp(grants?.latest_created_at ?? null, 'Latest quota grant created_at', true)
  const latestUsageCreatedAt = quotaStateTimestamp(usage?.latest_created_at ?? null, 'Latest usage event created_at', true)
  if (existingGrant) {
    quotaStateInteger(existingGrant.quantity, 'Existing quota adjustment quantity')
    quotaStateTimestamp(existingGrant.applied_at, 'Existing quota adjustment applied_at', true)
  }

  return {
    state: {
      credits: {
        balance,
        lifetimeUsed,
        balancePeriodKey: balancePeriodKey(period),
        updatedAt: latestGrantCreatedAt ?? latestUsageCreatedAt ?? period.start,
      },
      grants: {
        count: grantCount,
        quantity: grantQuantity,
        appliedCount: appliedGrantCount,
        latestCreatedAt: latestGrantCreatedAt,
      },
      usage: {
        count: usageCount,
        quantity: usageQuantity,
        latestCreatedAt: latestUsageCreatedAt,
      },
    },
    existingGrant: existingGrant ?? null,
  }
}

function exactExistingGrant(
  grant: ExistingGrantRow,
  input: QuotaAdjustmentInput,
  actor: string,
  period: QuotaAdjustmentPeriod,
): boolean {
  return grant.resource === ADJUSTMENT_RESOURCE
    && grant.unit === ADJUSTMENT_UNIT
    && typeof grant.quantity === 'number'
    && Number.isSafeInteger(grant.quantity)
    && grant.quantity >= 0
    && grant.quantity === input.quantity
    && grant.period_key === period.key
    && grant.period_start === period.start
    && grant.period_end === period.end
    && grant.grant_type === input.action
    && grant.reason === input.reason
    && grant.created_by === actor
}

function grantId(input: QuotaAdjustmentInput): string {
  return `quota-adjustment:${input.organizationId}:${input.idempotencyKey}`
}

function stateMatchPredicate(input: QuotaAdjustmentInput, period: QuotaAdjustmentPeriod, state: QuotaAdjustmentState): { sql: string; params: unknown[] } {
  return {
    sql: `
      (SELECT COUNT(*) FROM usage_quota_grants
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit'
             AND period_start = ? AND period_end = ?) = ?
      AND (SELECT COALESCE(SUM(quantity), 0) FROM usage_quota_grants
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit'
             AND period_start = ? AND period_end = ?) = ?
      AND (SELECT COALESCE(SUM(CASE WHEN applied_at IS NOT NULL THEN 1 ELSE 0 END), 0) FROM usage_quota_grants
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit'
             AND period_start = ? AND period_end = ?) = ?
      AND (SELECT MAX(created_at) FROM usage_quota_grants
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit'
             AND period_start = ? AND period_end = ?) IS ?
      AND (SELECT COUNT(*) FROM usage_events
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND created_at >= ? AND created_at < ?) = ?
      AND (SELECT COALESCE(SUM(quantity), 0) FROM usage_events
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND created_at >= ? AND created_at < ?) = ?
      AND (SELECT MAX(created_at) FROM usage_events
           WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND created_at >= ? AND created_at < ?) IS ?
    `,
    params: [
      input.organizationId,
      period.start,
      period.end,
      state.grants.count,
      input.organizationId,
      period.start,
      period.end,
      state.grants.quantity,
      input.organizationId,
      period.start,
      period.end,
      state.grants.appliedCount,
      input.organizationId,
      period.start,
      period.end,
      state.grants.latestCreatedAt,
      input.organizationId,
      period.start,
      period.end,
      state.usage.count,
      input.organizationId,
      period.start,
      period.end,
      state.usage.quantity,
      input.organizationId,
      period.start,
      period.end,
      state.usage.latestCreatedAt,
    ],
  }
}

function grantValues(input: QuotaAdjustmentInput, actor: string, period: QuotaAdjustmentPeriod, createdAt: string, id: string): unknown[] {
  return [
    id,
    input.organizationId,
    ADJUSTMENT_RESOURCE,
    input.quantity,
    ADJUSTMENT_UNIT,
    period.key,
    period.start,
    period.end,
    input.action,
    input.reason,
    actor,
    input.idempotencyKey,
    createdAt,
    createdAt,
  ]
}

function grantColumns(): string {
  return `(id, organization_id, resource, quantity, unit, period_key, period_start,
    period_end, grant_type, reason, created_by, idempotency_key, applied_at, created_at)`
}

export async function previewQuotaAdjustment(
  db: DbClient,
  secret: string,
  input: QuotaAdjustmentInput,
  actor: string,
  organizationLookup: QuotaAdjustmentOrganizationLookup,
  now = new Date(),
): Promise<QuotaAdjustmentPlan> {
  const period = currentPeriod(now)
  const snapshot = await readSnapshot(db, input, period, organizationLookup)
  if (snapshot.existingGrant && !exactExistingGrant(snapshot.existingGrant, input, actor, period)) {
    fail('idempotency_conflict', 409, 'Idempotency key is already used by a different quota adjustment.')
  }
  const expectedStateSha256 = await sha256CanonicalJson(snapshot.state)
  const expiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS).toISOString()
  let approvalToken: string
  try {
    approvalToken = await createOperatorApprovalToken(secret, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, period),
      expectedStateSha256,
      expiresAt,
    })
  } catch (error) {
    mapOperatorApprovalError(error)
  }
  return {
    actor,
    input,
    period,
    state: snapshot.state,
    expectedStateSha256,
    expiresAt,
    approvalToken,
  }
}

export async function applyQuotaAdjustment(
  db: DbClient,
  secret: string,
  input: QuotaAdjustmentInput,
  actor: string,
  expectedStateSha256: string,
  approvalToken: string,
  organizationLookup: QuotaAdjustmentOrganizationLookup,
  now = new Date(),
): Promise<QuotaAdjustmentResult> {
  const period = currentPeriod(now)
  try {
    await verifyOperatorApprovalToken<ApprovalRequest>(secret, approvalToken, {
      purpose: APPROVAL_PURPOSE,
      actor,
      request: approvalRequest(input, period),
      expectedStateSha256,
      now,
    })
  } catch (error) {
    mapOperatorApprovalError(error)
  }
  const snapshot = await readSnapshot(db, input, period, organizationLookup)
  const id = grantId(input)

  if (snapshot.existingGrant) {
    if (snapshot.existingGrant.applied_at && exactExistingGrant(snapshot.existingGrant, input, actor, period)) {
      return {
        status: 'already_applied',
        organizationId: input.organizationId,
        action: input.action,
        quantity: input.quantity,
        grantId: snapshot.existingGrant.id,
        period,
      }
    }
    fail('idempotency_conflict', 409, 'Idempotency key is already used by a different quota adjustment.')
  }

  const actualStateSha256 = await sha256CanonicalJson(snapshot.state)
  if (actualStateSha256 !== expectedStateSha256) {
    fail('stale_state', 409, 'Reviewed quota state is stale; create a new preview.')
  }

  const createdAt = now.toISOString()
  const values = grantValues(input, actor, period, createdAt, id)
  const predicate = stateMatchPredicate(input, period, snapshot.state)
  const statements: Array<{ query: string; params: unknown[] }> = [
    {
      query: `
        INSERT INTO usage_quota_grants ${grantColumns()}
        SELECT ${values.map(() => '?').join(', ')}
        WHERE NOT (${predicate.sql})
      `,
      params: [...values, ...predicate.params],
    },
    {
      query: `
        INSERT INTO usage_quota_grants ${grantColumns()}
        VALUES (${values.map(() => '?').join(', ')})
      `,
      params: values,
    },
  ]

  try {
    await executeBatch(db, statements)
  } catch (error) {
    const after = await readSnapshot(db, input, period, organizationLookup)
    if (after.existingGrant?.applied_at && exactExistingGrant(after.existingGrant, input, actor, period)) {
      return {
        status: 'already_applied',
        organizationId: input.organizationId,
        action: input.action,
        quantity: input.quantity,
        grantId: after.existingGrant.id,
        period,
      }
    }
    if (after.existingGrant) fail('idempotency_conflict', 409, 'Idempotency key is already used by a different quota adjustment.')
    const afterHash = await sha256CanonicalJson(after.state)
    if (afterHash !== expectedStateSha256) fail('stale_state', 409, 'Reviewed quota state is stale; create a new preview.')
    console.error('quota_adjustment_batch_failed', {
      organizationId: input.organizationId,
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    })
    fail('adjustment_failed', 500, 'Quota adjustment could not be applied.')
  }

  return {
    status: 'applied',
    organizationId: input.organizationId,
    action: input.action,
    quantity: input.quantity,
    grantId: id,
    period,
  }
}
