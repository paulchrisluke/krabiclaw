import { executeBatch, queryFirst, type DbClient } from '~/server/db'

const APPROVAL_WINDOW_MS = 10 * 60 * 1000
const APPROVAL_VERSION = 1
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

interface CreditRow {
  balance: number
  lifetime_used: number
  balance_period_key: string | null
  updated_at: string
}

interface AggregateRow {
  count: number | null
  quantity: number | null
  applied_count?: number | null
  latest_created_at: string | null
}

interface ExistingGrantRow {
  id: string
  resource: string
  quantity: number
  unit: string
  period_key: string
  period_start: string
  period_end: string | null
  grant_type: string
  reason: string
  created_by: string | null
  idempotency_key: string
  applied_at: string | null
}

interface QuotaAdjustmentSnapshot {
  state: QuotaAdjustmentState
  existingGrant: ExistingGrantRow | null
}

interface ApprovalClaims {
  version: number
  actor: string
  input: QuotaAdjustmentInput
  period: QuotaAdjustmentPeriod
  expectedStateSha256: string
  expiresAt: string
}

function fail(code: string, statusCode: number, message: string): never {
  throw new QuotaAdjustmentError(code, statusCode, message)
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
  if (!isRecord(session)) fail('authentication_required', 401, 'Authentication required.')
  const user = isRecord(session.user) ? session.user : null
  const userId = typeof user?.id === 'string' ? user.id.trim() : ''
  if (!userId) fail('authentication_required', 401, 'Authenticated operator user is required.')
  const authSession = isRecord(session.session) ? session.session : null
  const impersonatedBy = authSession?.impersonatedBy ?? session.impersonatedBy
  if (typeof impersonatedBy === 'string' && impersonatedBy.trim()) {
    fail('impersonation_forbidden', 403, 'Quota adjustments cannot run in an impersonation session.')
  }
  return userId
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(value)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail('approval_token_invalid', 409, 'Approval token is invalid.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    fail('approval_token_invalid', 409, 'Approval token is invalid.')
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function importApprovalKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (!secret) fail('configuration_error', 500, 'BETTER_AUTH_SECRET is required for quota approvals.')
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  )
}

async function createApprovalToken(secret: string, claims: ApprovalClaims): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(canonicalJson(claims)))
  const key = await importApprovalKey(secret, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

async function verifyApprovalToken(secret: string, token: string): Promise<ApprovalClaims> {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) fail('approval_token_invalid', 409, 'Approval token is invalid.')
  const payloadBytes = base64UrlToBytes(parts[0])
  const signatureBytes = base64UrlToBytes(parts[1])
  let claims: unknown
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    fail('approval_token_invalid', 409, 'Approval token is invalid.')
  }
  const key = await importApprovalKey(secret, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes as unknown as BufferSource, new TextEncoder().encode(parts[0]))
  if (!valid || !isRecord(claims)) fail('approval_token_invalid', 409, 'Approval token is invalid.')
  return claims as unknown as ApprovalClaims
}

function assertClaimsMatch(
  claims: ApprovalClaims,
  actor: string,
  input: QuotaAdjustmentInput,
  period: QuotaAdjustmentPeriod,
  expectedStateSha256: string,
  now: Date,
): void {
  if (claims.version !== APPROVAL_VERSION) fail('approval_token_invalid', 409, 'Approval token version is invalid.')
  const expiresAt = Date.parse(claims.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) fail('approval_expired', 409, 'Approval token has expired.')
  if (
    claims.actor !== actor
    || canonicalJson(claims.input) !== canonicalJson(input)
    || canonicalJson(claims.period) !== canonicalJson(period)
  ) {
    fail('approval_token_mismatch', 409, 'Approval token does not match this operator request.')
  }
  if (claims.expectedStateSha256 !== expectedStateSha256) {
    fail('approval_state_mismatch', 409, 'Approval state digest does not match the reviewed plan.')
  }
}

async function readSnapshot(db: DbClient, input: QuotaAdjustmentInput, period: QuotaAdjustmentPeriod): Promise<QuotaAdjustmentSnapshot> {
  const organization = await queryFirst<{ id: string }>(db, `
    SELECT id FROM organization WHERE id = ? LIMIT 1
  `, [input.organizationId])
  if (!organization) fail('organization_not_found', 404, 'Organization not found.')

  const credits = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, balance_period_key, updated_at
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [input.organizationId])
  if (!credits) {
    fail('quota_initialization_required', 409, 'AI quota requires initialization before an operator adjustment.')
  }
  if (!credits.balance_period_key || !credits.balance_period_key.trim()) {
    fail('quota_reconciliation_required', 409, 'AI quota requires legacy reconciliation before an operator adjustment.')
  }
  const balance = Number(credits.balance)
  const lifetimeUsed = Number(credits.lifetime_used)
  if (
    typeof credits.balance !== 'number'
    || typeof credits.lifetime_used !== 'number'
    || !Number.isSafeInteger(balance)
    || balance < 0
    || !Number.isSafeInteger(lifetimeUsed)
    || lifetimeUsed < 0
  ) {
    fail('quota_state_invalid', 500, 'AI quota contains invalid numeric state.')
  }
  if (credits.balance_period_key !== balancePeriodKey(period)) {
    fail('quota_reconciliation_required', 409, 'AI quota is not initialized for the current UTC week.')
  }

  const grants = await queryFirst<AggregateRow>(db, `
    SELECT COUNT(*) AS count,
           COALESCE(SUM(quantity), 0) AS quantity,
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

  return {
    state: {
      credits: {
        balance,
        lifetimeUsed,
        balancePeriodKey: credits.balance_period_key,
        updatedAt: credits.updated_at,
      },
      grants: {
        count: Number(grants?.count ?? 0),
        quantity: Number(grants?.quantity ?? 0),
        appliedCount: Number(grants?.applied_count ?? 0),
        latestCreatedAt: grants?.latest_created_at ?? null,
      },
      usage: {
        count: Number(usage?.count ?? 0),
        quantity: Number(usage?.quantity ?? 0),
        latestCreatedAt: usage?.latest_created_at ?? null,
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
    && Number(grant.quantity) === input.quantity
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
      EXISTS (
        SELECT 1 FROM ai_credits
        WHERE organization_id = ?
          AND balance = ?
          AND lifetime_used = ?
          AND balance_period_key IS ?
          AND updated_at IS ?
      )
      AND (SELECT COUNT(*) FROM usage_quota_grants
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
      state.credits.balance,
      state.credits.lifetimeUsed,
      state.credits.balancePeriodKey,
      state.credits.updatedAt,
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
    null,
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
  now = new Date(),
): Promise<QuotaAdjustmentPlan> {
  const period = currentPeriod(now)
  const snapshot = await readSnapshot(db, input, period)
  if (snapshot.existingGrant && !exactExistingGrant(snapshot.existingGrant, input, actor, period)) {
    fail('idempotency_conflict', 409, 'Idempotency key is already used by a different quota adjustment.')
  }
  const expectedStateSha256 = await sha256Hex(canonicalJson(snapshot.state))
  const expiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS).toISOString()
  const claims: ApprovalClaims = {
    version: APPROVAL_VERSION,
    actor,
    input,
    period,
    expectedStateSha256,
    expiresAt,
  }
  return {
    actor,
    input,
    period,
    state: snapshot.state,
    expectedStateSha256,
    expiresAt,
    approvalToken: await createApprovalToken(secret, claims),
  }
}

export async function applyQuotaAdjustment(
  db: DbClient,
  secret: string,
  input: QuotaAdjustmentInput,
  actor: string,
  expectedStateSha256: string,
  approvalToken: string,
  now = new Date(),
): Promise<QuotaAdjustmentResult> {
  const period = currentPeriod(now)
  const claims = await verifyApprovalToken(secret, approvalToken)
  assertClaimsMatch(claims, actor, input, period, expectedStateSha256, now)
  const snapshot = await readSnapshot(db, input, period)
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

  const actualStateSha256 = await sha256Hex(canonicalJson(snapshot.state))
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
    {
      query: `
        UPDATE ai_credits
        SET balance = CASE WHEN ? = 'manual' THEN balance + ? ELSE ? END,
            balance_period_key = ?,
            updated_at = ?
        WHERE organization_id = ?
          AND balance = ?
          AND lifetime_used = ?
          AND balance_period_key IS ?
          AND updated_at IS ?
      `,
      params: [
        input.action,
        input.quantity,
        input.quantity,
        balancePeriodKey(period),
        createdAt,
        input.organizationId,
        snapshot.state.credits.balance,
        snapshot.state.credits.lifetimeUsed,
        snapshot.state.credits.balancePeriodKey,
        snapshot.state.credits.updatedAt,
      ],
    },
    {
      query: `
        UPDATE usage_quota_grants
        SET applied_at = ?
        WHERE id = ? AND organization_id = ? AND idempotency_key = ? AND applied_at IS NULL
      `,
      params: [createdAt, id, input.organizationId, input.idempotencyKey],
    },
  ]

  try {
    await executeBatch(db, statements)
  } catch (error) {
    const after = await readSnapshot(db, input, period)
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
    const afterHash = await sha256Hex(canonicalJson(after.state))
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
