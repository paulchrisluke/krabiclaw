import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  ACTION_CREDIT_COSTS,
  tokensToCredits,
  usageForFlatCreditAction,
  type FlatCreditAction,
} from '~/server/utils/ai-credits'
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
const APPROVAL_PURPOSE = 'historical_usage_reconciliation' as const
const CREDIT_RESOURCE = 'ai_inference' as const
const CREDIT_UNIT = 'credit' as const
const AUDIT_RESOURCE = 'ai_reconciliation' as const
const AUDIT_UNIT = 'audit' as const
const HISTORY_PREFIX = 'history:ai-usage-log:'
const RESIDUAL_PREFIX = 'history:historical-unattributed:'
const MARKER_PREFIX = 'history:reconciliation:'
const RESET_PREFIX = 'history:reconciliation-reset:'

export type HistoricalUsageReconciliationMode = 'preview' | 'apply'

export interface HistoricalUsageReconciliationInput {
  organizationId: string
  cutoffAt: string
  reason: string
  idempotencyKey: string
}

export interface ParsedHistoricalUsageReconciliationRequest {
  mode: HistoricalUsageReconciliationMode
  input: HistoricalUsageReconciliationInput
  expectedStateSha256?: string
  approvalToken?: string
}

export interface HistoricalUsageReconciliationPeriod {
  key: string
  start: string
  end: string
}

export interface HistoricalUsageReconciliationState {
  credits: {
    balance: number
    lifetimeUsed: number
    lastToppedUpAt: string | null
    balancePeriodKey: string | null
    updatedAt: string
  }
  legacy: {
    count: number
    inputTokens: number
    outputTokens: number
    creditsCharged: number
    derivedQuantity: number
    latestCreatedAt: string | null
  }
  canonical: {
    count: number
    quantity: number
    latestCreatedAt: string | null
  }
  grants: {
    count: number
    quantity: number
    appliedCount: number
    latestCreatedAt: string | null
  }
  fingerprints: {
    legacy: string
    events: string
    grants: string
  }
  operationMarker: 'absent'
}

export interface HistoricalUsageLegacyPlan {
  id: string
  organizationId: string
  siteId: string | null
  action: string
  model: string
  inputTokens: number
  outputTokens: number
  creditsCharged: number
  cfGatewayLogId: string | null
  createdAt: string
  quantity: number
  resource: string
  source: string
  provider: string
  channel: string
  basis: 'flat' | 'tokens'
  historyKey: string
  metadata: Record<string, unknown>
  status: 'backfill' | 'matched'
  matchedEventId: string | null
}

export interface HistoricalUsageResidualPlan {
  quantity: number
  id: string
  idempotencyKey: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface HistoricalUsageResetPlan {
  required: boolean
  quantity: number
  id: string
  idempotencyKey: string
  periodKey: string
  periodStart: string
  periodEnd: string
}

export interface HistoricalUsageReconciliationPlan {
  actor: string
  input: HistoricalUsageReconciliationInput
  period: HistoricalUsageReconciliationPeriod
  state: HistoricalUsageReconciliationState
  expectedStateSha256: string
  expiresAt: string
  approvalToken: string
  legacyLogs: HistoricalUsageLegacyPlan[]
  backfillCount: number
  matchedCount: number
  backfillQuantity: number
  residual: HistoricalUsageResidualPlan | null
  reset: HistoricalUsageResetPlan
  markerId: string
  markerIdempotencyKey: string
}

export type HistoricalUsageReconciliationResult =
  | {
      status: 'applied'
      organizationId: string
      cutoffAt: string
      backfillCount: number
      matchedCount: number
      residualQuantity: number
      resetApplied: boolean
      markerId: string
    }
  | {
      status: 'already_applied'
      organizationId: string
      cutoffAt: string
      backfillCount: number
      matchedCount: number
      residualQuantity: number
      resetApplied: boolean
      markerId: string
    }

export type HistoricalUsageReconciliationErrorCode =
  | 'invalid_request'
  | 'authentication_required'
  | 'impersonation_forbidden'
  | 'organization_not_found'
  | 'quota_initialization_required'
  | 'quota_state_invalid'
  | 'legacy_usage_invalid'
  | 'canonical_usage_conflict'
  | 'lifetime_usage_conflict'
  | 'cutoff_not_historical'
  | 'quota_reconciliation_required'
  | 'idempotency_conflict'
  | 'stale_state'
  | 'approval_token_invalid'
  | 'approval_expired'
  | 'approval_token_mismatch'
  | 'approval_state_mismatch'
  | 'configuration_error'
  | 'reconciliation_failed'

export class HistoricalUsageReconciliationError extends Error {
  readonly code: HistoricalUsageReconciliationErrorCode
  readonly statusCode: number

  constructor(code: HistoricalUsageReconciliationErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'HistoricalUsageReconciliationError'
    this.code = code
    this.statusCode = statusCode
  }
}

interface LegacyUsageLogRow {
  id: string
  organization_id: string
  site_id: string | null
  action: string
  model: string
  input_tokens: number
  output_tokens: number
  credits_charged: number
  cf_gateway_log_id: string | null
  created_at: string
}

interface CanonicalUsageEventRow {
  id: string
  organization_id: string
  site_id: string | null
  resource: string
  source: string
  provider: string | null
  channel: string | null
  quantity: number
  unit: string
  metadata_json: string | null
  idempotency_key: string
  created_at: string
}

interface CurrentGrantRow {
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
  applied_at: string | null
  created_at: string
  idempotency_key: string
}

interface CreditRow {
  balance: number
  lifetime_used: number
  last_topped_up_at: string | null
  balance_period_key: string | null
  updated_at: string
}

interface OperationMarker {
  id: string
  organization_id: string
  site_id: string | null
  resource: string
  source: string
  provider: string | null
  channel: string | null
  session_id: string | null
  quantity: number
  unit: string
  metadata_json: string | null
  idempotency_key: string
  created_at: string
}

interface ReadContext {
  state: HistoricalUsageReconciliationState
  credits: CreditRow
  legacyRows: HistoricalUsageLegacyPlan[]
  canonicalRows: CanonicalUsageEventRow[]
  grants: CurrentGrantRow[]
  marker: OperationMarker | null
  residualEvent: CanonicalUsageEventRow | null
  resetGrant: CurrentGrantRow | null
}

interface ApprovalRequest {
  input: HistoricalUsageReconciliationInput
  period: HistoricalUsageReconciliationPeriod
}

function fail(code: HistoricalUsageReconciliationErrorCode, statusCode: number, message: string): never {
  throw new HistoricalUsageReconciliationError(code, statusCode, message)
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

function safeKey(value: unknown, field: string, maxLength: number): string {
  const key = requiredString(value, field, maxLength)
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    fail('invalid_request', 400, `${field} must contain only letters, numbers, underscores, and hyphens.`)
  }
  return key
}

function isoDate(value: unknown, field: string): string {
  const raw = requiredString(value, field, 64)
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) fail('invalid_request', 400, `${field} must be a valid ISO timestamp.`)
  return date.toISOString()
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(body).filter(key => !allowed.has(key))
  if (unknown.length > 0) fail('invalid_request', 400, `Unsupported historical reconciliation field: ${unknown[0]}`)
}

export function parseHistoricalUsageReconciliationRequest(body: unknown): ParsedHistoricalUsageReconciliationRequest {
  if (!isRecord(body)) fail('invalid_request', 400, 'A historical reconciliation body is required.')
  const mode = body.mode === undefined ? 'preview' : body.mode
  if (mode !== 'preview' && mode !== 'apply') fail('invalid_request', 400, 'mode must be preview or apply.')
  const allowed = new Set(['organizationId', 'cutoffAt', 'reason', 'idempotencyKey', 'mode'])
  if (mode === 'apply') {
    allowed.add('expectedStateSha256')
    allowed.add('approvalToken')
  }
  rejectUnknownFields(body, allowed)

  const parsed: ParsedHistoricalUsageReconciliationRequest = {
    mode,
    input: {
      organizationId: safeKey(body.organizationId, 'organizationId', 128),
      cutoffAt: isoDate(body.cutoffAt, 'cutoffAt'),
      reason: requiredString(body.reason, 'reason', 1000),
      idempotencyKey: safeKey(body.idempotencyKey, 'idempotencyKey', 200),
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

export function assertHistoricalUsageReconciliationOperatorSession(session: unknown): string {
  try {
    return assertDirectOperatorSession(session)
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      fail(
        error.code,
        error.statusCode,
        error.code === 'impersonation_forbidden'
          ? 'Historical usage reconciliation cannot run in an impersonation session.'
          : error.message,
      )
    }
    throw error
  }
}

function currentPeriod(now: Date): HistoricalUsageReconciliationPeriod {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const daysFromMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysFromMonday)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  const key = start.toISOString().slice(0, 10)
  return { key: `week:${key}`, start: start.toISOString(), end: end.toISOString() }
}

function periodBalanceKey(period: HistoricalUsageReconciliationPeriod): string {
  return period.key.slice('week:'.length)
}

function assertHistoricalInput(input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod): void {
  safeKey(input.organizationId, 'organizationId', 128)
  requiredString(input.reason, 'reason', 1000)
  safeKey(input.idempotencyKey, 'idempotencyKey', 200)
  const cutoffValue = requiredString(input.cutoffAt, 'cutoffAt', 64)
  const cutoffDate = new Date(cutoffValue)
  const cutoff = cutoffDate.getTime()
  const periodStart = Date.parse(period.start)
  if (!Number.isFinite(cutoff) || cutoffDate.toISOString() !== cutoffValue || !Number.isFinite(periodStart)) {
    fail('invalid_request', 400, 'cutoffAt must be a valid ISO timestamp.')
  }
  if (cutoff >= periodStart) {
    fail('cutoff_not_historical', 409, 'cutoffAt must be strictly before the current UTC week.')
  }
}

function historyKey(legacyId: string): string {
  return `${HISTORY_PREFIX}${legacyId}`
}

function residualKey(organizationId: string): string {
  return `${RESIDUAL_PREFIX}${organizationId}`
}

function markerKey(organizationId: string, idempotencyKey: string): string {
  return `${MARKER_PREFIX}${organizationId}:${idempotencyKey}`
}

function resetKey(organizationId: string, idempotencyKey: string): string {
  return `${RESET_PREFIX}${organizationId}:${idempotencyKey}`
}

function markerId(organizationId: string, idempotencyKey: string): string {
  return markerKey(organizationId, idempotencyKey)
}

function resetId(organizationId: string, idempotencyKey: string): string {
  return resetKey(organizationId, idempotencyKey)
}

function safeNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail('legacy_usage_invalid', 409, `${field} must be a non-negative safe integer.`)
  }
  return value
}

function safeSum(values: number[], field: string): number {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isSafeInteger(total) || total < 0) fail('legacy_usage_invalid', 409, `${field} exceeds safe integer range.`)
  }
  return total
}

function tokenQuantity(inputTokens: number, outputTokens: number, id: string): number {
  const weightedOutput = outputTokens * 5
  const normalizedTokens = inputTokens + weightedOutput
  if (!Number.isSafeInteger(weightedOutput) || !Number.isSafeInteger(normalizedTokens)) {
    fail('legacy_usage_invalid', 409, `Legacy usage ${id} has unsafe token normalization.`)
  }
  const quantity = tokensToCredits(inputTokens, outputTokens)
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    fail('legacy_usage_invalid', 409, `Legacy usage ${id} has an unsafe derived quantity.`)
  }
  return quantity
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function metadataEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
}

function flatAction(value: string): value is FlatCreditAction {
  return Object.prototype.hasOwnProperty.call(ACTION_CREDIT_COSTS, value)
}

function legacyDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail('legacy_usage_invalid', 409, 'Legacy usage created_at must be a valid timestamp.')
  }
  return value
}

function expectedMetadata(row: LegacyUsageLogRow, basis: 'flat' | 'tokens'): Record<string, unknown> {
  return {
    action: row.action,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cfGatewayLogId: row.cf_gateway_log_id,
    historical: {
      legacyLogId: row.id,
      legacyCreditsCharged: row.credits_charged,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      basis,
    },
  }
}

function canonicalMetadataMatches(row: LegacyUsageLogRow, metadataJson: string | null): boolean {
  const metadata = parseMetadata(metadataJson)
  if (!metadata) return false
  if (metadata.action !== row.action) return false
  if (flatAction(row.action)) {
    const charged = row.credits_charged === ACTION_CREDIT_COSTS[row.action]
    if (metadata.creditsCharged !== ACTION_CREDIT_COSTS[row.action] || metadata.charged !== charged) return false
    if (!Object.prototype.hasOwnProperty.call(metadata, 'cfGatewayLogId')) return false
    return metadata.cfGatewayLogId === row.cf_gateway_log_id
  }
  if (metadata.model !== row.model) return false
  if (metadata.inputTokens !== row.input_tokens || metadata.outputTokens !== row.output_tokens) return false
  if (row.cf_gateway_log_id !== null && metadata.cfGatewayLogId !== row.cf_gateway_log_id) return false
  return true
}

function canonicalEventMatches(row: LegacyUsageLogRow, plan: HistoricalUsageLegacyPlan, event: CanonicalUsageEventRow): boolean {
  return event.organization_id === row.organization_id
    && event.site_id === row.site_id
    && event.resource === plan.resource
    && event.quantity === plan.quantity
    && event.unit === CREDIT_UNIT
    && event.created_at === row.created_at
    && canonicalMetadataMatches(row, event.metadata_json)
}

function exactHistoryEventMatches(plan: HistoricalUsageLegacyPlan, event: CanonicalUsageEventRow): boolean {
  return event.organization_id === plan.organizationId
    && event.site_id === plan.siteId
    && event.resource === plan.resource
    && event.source === plan.source
    && event.provider === plan.provider
    && event.channel === plan.channel
    && event.quantity === plan.quantity
    && event.unit === CREDIT_UNIT
    && event.metadata_json !== null
    && metadataEqual(parseMetadata(event.metadata_json), plan.metadata)
    && event.idempotency_key === plan.historyKey
    && event.created_at === plan.createdAt
}

function mappingForLegacy(action: string): {
  quantity: number
  resource: string
  source: string
  provider: string
  channel: string
  basis: 'flat' | 'tokens'
} {
  if (flatAction(action)) {
    const usage = usageForFlatCreditAction(action)
    return {
      quantity: ACTION_CREDIT_COSTS[action],
      resource: usage.resource,
      source: usage.source,
      provider: usage.provider,
      channel: usage.channel,
      basis: 'flat',
    }
  }
  return {
    quantity: 0,
    resource: CREDIT_RESOURCE,
    source: 'historical_reconciliation',
    provider: 'ai',
    channel: 'legacy',
    basis: 'tokens',
  }
}

async function readLegacyPlans(
  db: DbClient,
  input: HistoricalUsageReconciliationInput,
  allEventRows: CanonicalUsageEventRow[],
): Promise<HistoricalUsageLegacyPlan[]> {
  const rows = await queryAll<LegacyUsageLogRow>(db, `
    SELECT id, organization_id, site_id, action, model, input_tokens, output_tokens,
           credits_charged, cf_gateway_log_id, created_at
    FROM ai_usage_log
    WHERE organization_id = ? AND created_at <= ?
    ORDER BY created_at ASC, id ASC
  `, [input.organizationId, input.cutoffAt])

  const plans: HistoricalUsageLegacyPlan[] = []
  for (const row of rows) {
    const id = requiredString(row.id, 'legacy usage id', 256)
    const action = requiredString(row.action, 'legacy usage action', 256)
    const model = requiredString(row.model, 'legacy usage model', 256)
    const inputTokens = safeNonNegative(row.input_tokens, 'input_tokens')
    const outputTokens = safeNonNegative(row.output_tokens, 'output_tokens')
    const creditsCharged = safeNonNegative(row.credits_charged, 'credits_charged')
    const createdAt = legacyDate(row.created_at)
    const gateway = row.cf_gateway_log_id === null || row.cf_gateway_log_id === undefined
      ? null
      : requiredString(row.cf_gateway_log_id, 'cf_gateway_log_id', 512)
    const mapped = mappingForLegacy(action)
    const quantity = mapped.basis === 'flat' ? mapped.quantity : tokenQuantity(inputTokens, outputTokens, id)
    if (mapped.basis === 'tokens' && quantity === 0) {
      fail('legacy_usage_invalid', 409, `Legacy usage ${id} has no token-derived quantity.`)
    }
    if (creditsCharged !== 0 && creditsCharged !== quantity) {
      fail('legacy_usage_invalid', 409, `Legacy usage ${id} has an inconsistent credits_charged value.`)
    }
    const normalizedRow: LegacyUsageLogRow = {
      id,
      organization_id: input.organizationId,
      site_id: row.site_id ?? null,
      action,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      credits_charged: creditsCharged,
      cf_gateway_log_id: gateway,
      created_at: createdAt,
    }
    const metadata = expectedMetadata(normalizedRow, mapped.basis)
    const history = historyKey(id)
    const plan: HistoricalUsageLegacyPlan = {
      id,
      organizationId: input.organizationId,
      siteId: normalizedRow.site_id,
      action,
      model,
      inputTokens,
      outputTokens,
      creditsCharged,
      cfGatewayLogId: gateway,
      createdAt,
      quantity,
      resource: mapped.resource,
      source: mapped.source,
      provider: mapped.provider,
      channel: mapped.channel,
      basis: mapped.basis,
      historyKey: history,
      metadata,
      status: 'backfill',
      matchedEventId: null,
    }
    const sameHistory = allEventRows.filter(event => event.organization_id === input.organizationId && event.idempotency_key === history)
    const historyEvent = sameHistory[0]
    if (sameHistory.length > 1 || (historyEvent && !exactHistoryEventMatches(plan, historyEvent))) {
      fail('canonical_usage_conflict', 409, `History key ${history} is already used by a different event.`)
    }
    const matches = allEventRows.filter(event => event.unit === CREDIT_UNIT && canonicalEventMatches(normalizedRow, plan, event))
    if (historyEvent && !matches.some(event => event.id === historyEvent.id)) matches.push(historyEvent)
    if (matches.length > 1) {
      fail('canonical_usage_conflict', 409, `Legacy usage ${id} has ambiguous canonical matches.`)
    }
    if (matches.length === 1) {
      const match = matches[0]
      if (match) {
        plan.status = 'matched'
        plan.matchedEventId = match.id
      }
    }
    plans.push(plan)
  }
  return plans
}

function assertCreditRow(row: CreditRow): CreditRow {
  if (
    typeof row.balance !== 'number' || !Number.isSafeInteger(row.balance) || row.balance < 0
    || typeof row.lifetime_used !== 'number' || !Number.isSafeInteger(row.lifetime_used) || row.lifetime_used < 0
    || (row.last_topped_up_at !== null && typeof row.last_topped_up_at !== 'string')
    || (row.balance_period_key !== null && typeof row.balance_period_key !== 'string')
    || typeof row.updated_at !== 'string' || !row.updated_at
  ) {
    fail('quota_state_invalid', 500, 'AI quota contains invalid numeric state.')
  }
  return row
}

function aggregateLegacy(plans: HistoricalUsageLegacyPlan[]): HistoricalUsageReconciliationState['legacy'] {
  const latestCreatedAt = plans.length > 0 ? plans[plans.length - 1]!.createdAt : null
  return {
    count: plans.length,
    inputTokens: safeSum(plans.map(row => row.inputTokens), 'input_tokens'),
    outputTokens: safeSum(plans.map(row => row.outputTokens), 'output_tokens'),
    creditsCharged: safeSum(plans.map(row => row.creditsCharged), 'credits_charged'),
    derivedQuantity: safeSum(plans.map(row => row.quantity), 'derived quantity'),
    latestCreatedAt,
  }
}

function aggregateCanonical(rows: CanonicalUsageEventRow[]): HistoricalUsageReconciliationState['canonical'] {
  const firstCreatedAt = rows[0]?.created_at ?? null
  return {
    count: rows.length,
    quantity: safeSum(rows.map(row => safeNonNegative(row.quantity, 'canonical quantity')), 'canonical quantity'),
    latestCreatedAt: firstCreatedAt === null ? null : rows.reduce((latest, row) => row.created_at > latest ? row.created_at : latest, firstCreatedAt),
  }
}

function aggregateGrants(rows: CurrentGrantRow[]): HistoricalUsageReconciliationState['grants'] {
  const firstCreatedAt = rows[0]?.created_at ?? null
  return {
    count: rows.length,
    quantity: safeSum(rows.map(row => safeNonNegative(row.quantity, 'quota grant quantity')), 'quota grant quantity'),
    appliedCount: rows.filter(row => row.applied_at !== null).length,
    latestCreatedAt: firstCreatedAt === null ? null : rows.reduce((latest, row) => row.created_at > latest ? row.created_at : latest, firstCreatedAt),
  }
}

function markerRequest(input: HistoricalUsageReconciliationInput, actor: string, period: HistoricalUsageReconciliationPeriod): Record<string, unknown> {
  return { actor, input, period }
}

function markerMetadata(
  input: HistoricalUsageReconciliationInput,
  actor: string,
  period: HistoricalUsageReconciliationPeriod,
  plan: { stateSha256: string; backfillCount: number; matchedCount: number; backfillQuantity: number; residualQuantity: number; resetApplied: boolean },
): Record<string, unknown> {
  return {
    kind: 'historical_usage_reconciliation',
    request: markerRequest(input, actor, period),
    expectedStateSha256: plan.stateSha256,
    backfillCount: plan.backfillCount,
    matchedCount: plan.matchedCount,
    backfillQuantity: plan.backfillQuantity,
    residualQuantity: plan.residualQuantity,
    resetApplied: plan.resetApplied,
  }
}

interface MarkerAuditResult {
  backfillCount: number
  matchedCount: number
  residualQuantity: number
  resetApplied: boolean
}

function markerAuditResult(marker: OperationMarker, actor: string, input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod): MarkerAuditResult | null {
  const metadata = parseMetadata(marker.metadata_json)
  if (!metadata) return null
  const keys = Object.keys(metadata).sort()
  const expectedKeys = ['actor', 'backfillCount', 'backfillQuantity', 'expectedStateSha256', 'kind', 'matchedCount', 'request', 'resetApplied', 'residualQuantity']
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return null
  if (metadata.kind !== 'historical_usage_reconciliation' || metadata.actor !== actor) return null
  if (typeof metadata.expectedStateSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(metadata.expectedStateSha256)) return null
  if (typeof metadata.resetApplied !== 'boolean') return null
  const numericFields = ['backfillCount', 'matchedCount', 'backfillQuantity', 'residualQuantity'] as const
  for (const field of numericFields) {
    if (typeof metadata[field] !== 'number' || !Number.isSafeInteger(metadata[field]) || metadata[field] < 0) return null
  }
  if (!metadataEqual(metadata.request, markerRequest(input, actor, period))) return null
  return {
    backfillCount: metadata.backfillCount as number,
    matchedCount: metadata.matchedCount as number,
    residualQuantity: metadata.residualQuantity as number,
    resetApplied: metadata.resetApplied as boolean,
  }
}

function markerMatchesRequest(marker: OperationMarker, input: HistoricalUsageReconciliationInput, actor: string, period: HistoricalUsageReconciliationPeriod): boolean {
  return marker.resource === AUDIT_RESOURCE
    && marker.id === markerId(input.organizationId, input.idempotencyKey)
    && marker.organization_id === input.organizationId
    && marker.site_id === null
    && marker.unit === AUDIT_UNIT
    && marker.source === 'historical_reconciliation'
    && marker.provider === 'internal'
    && marker.channel === 'operator'
    && marker.session_id === null
    && marker.quantity === 0
    && marker.idempotency_key === markerKey(input.organizationId, input.idempotencyKey)
    && markerAuditResult(marker, actor, input, period) !== null
}

function approvalFailure(error: unknown): never {
  if (error instanceof OperatorApprovalError) {
    fail(
      error.code,
      error.statusCode,
      error.code === 'configuration_error'
        ? 'BETTER_AUTH_SECRET is required for historical reconciliation approvals.'
        : error.message,
    )
  }
  throw error
}

function approvalRequest(input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod): ApprovalRequest {
  return { input, period }
}

async function readContext(
  db: DbClient,
  input: HistoricalUsageReconciliationInput,
  period: HistoricalUsageReconciliationPeriod,
): Promise<ReadContext> {
  assertHistoricalInput(input, period)
  const creditRow = await queryFirst<CreditRow>(db, `
    SELECT balance, lifetime_used, last_topped_up_at, balance_period_key, updated_at
    FROM ai_credits WHERE organization_id = ? LIMIT 1
  `, [input.organizationId])
  if (!creditRow) fail('quota_initialization_required', 409, 'AI quota requires initialization before reconciliation.')
  const credits = assertCreditRow(creditRow)
  if (credits.balance_period_key !== null && credits.balance_period_key !== periodBalanceKey(period)) {
    fail('quota_reconciliation_required', 409, 'AI quota is initialized for a stale UTC week.')
  }

  const allEventRows = await queryAll<CanonicalUsageEventRow>(db, `
    SELECT id, organization_id, site_id, resource, source, provider, channel,
           quantity, unit, metadata_json, idempotency_key, created_at
    FROM usage_events
    WHERE organization_id = ?
    ORDER BY created_at ASC, id ASC
  `, [input.organizationId])
  const canonicalRows = allEventRows.filter(event => event.unit === CREDIT_UNIT)
  const plans = await readLegacyPlans(db, input, allEventRows)
  const legacyFingerprint = await queryFirst<{ fingerprint: string }>(db, `
    SELECT ${legacyFingerprintExpression()} AS fingerprint
  `, [input.organizationId, input.cutoffAt])
  const eventFingerprint = await queryFirst<{ fingerprint: string }>(db, `
    SELECT ${eventFingerprintExpression()} AS fingerprint
  `, [input.organizationId])
  const grants = await queryAll<CurrentGrantRow>(db, `
    SELECT id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, applied_at, created_at, idempotency_key
    FROM usage_quota_grants
    WHERE organization_id = ?
      AND resource = ? AND unit = ?
      AND period_start = ? AND period_end = ?
    ORDER BY created_at ASC, id ASC
  `, [input.organizationId, CREDIT_RESOURCE, CREDIT_UNIT, period.start, period.end])
  const marker = await queryFirst<OperationMarker>(db, `
    SELECT id, organization_id, site_id, resource, source, provider, channel,
           session_id, quantity, unit, metadata_json, idempotency_key, created_at
    FROM usage_events
    WHERE organization_id = ? AND idempotency_key = ?
    LIMIT 1
  `, [input.organizationId, markerKey(input.organizationId, input.idempotencyKey)])
  const residualEvent = await queryFirst<CanonicalUsageEventRow>(db, `
    SELECT id, organization_id, site_id, resource, source, provider, channel,
           quantity, unit, metadata_json, idempotency_key, created_at
    FROM usage_events
    WHERE organization_id = ? AND idempotency_key = ?
    LIMIT 1
  `, [input.organizationId, residualKey(input.organizationId)])
  const resetGrant = await queryFirst<CurrentGrantRow>(db, `
    SELECT id, resource, quantity, unit, period_key, period_start, period_end,
           grant_type, reason, created_by, applied_at, created_at, idempotency_key
    FROM usage_quota_grants
    WHERE organization_id = ? AND idempotency_key = ?
    LIMIT 1
  `, [input.organizationId, resetKey(input.organizationId, input.idempotencyKey)])
  const grantFingerprint = await queryFirst<{ fingerprint: string }>(db, `
    SELECT ${grantFingerprintExpression()} AS fingerprint
  `, [input.organizationId])

  const state: HistoricalUsageReconciliationState = {
    credits: {
      balance: credits.balance,
      lifetimeUsed: credits.lifetime_used,
      lastToppedUpAt: credits.last_topped_up_at ?? null,
      balancePeriodKey: credits.balance_period_key ?? null,
      updatedAt: credits.updated_at,
    },
    legacy: aggregateLegacy(plans),
    canonical: aggregateCanonical(canonicalRows),
    grants: aggregateGrants(grants),
    fingerprints: {
      legacy: legacyFingerprint?.fingerprint ?? '[]',
      events: eventFingerprint?.fingerprint ?? '[]',
      grants: grantFingerprint?.fingerprint ?? '[]',
    },
    operationMarker: 'absent',
  }
  return { state, credits, legacyRows: plans, canonicalRows, grants, marker, residualEvent, resetGrant }
}

function exactResidualEvent(event: CanonicalUsageEventRow, plan: HistoricalUsageResidualPlan): boolean {
  return event.resource === CREDIT_RESOURCE
    && event.source === 'historical_reconciliation'
    && event.provider === 'ai'
    && event.channel === 'historical'
    && event.site_id === null
    && event.quantity === plan.quantity
    && event.unit === CREDIT_UNIT
    && event.idempotency_key === plan.idempotencyKey
    && event.created_at === plan.createdAt
    && metadataEqual(parseMetadata(event.metadata_json), plan.metadata)
}

function exactResetGrant(grant: CurrentGrantRow, plan: HistoricalUsageResetPlan, reason: string, actor: string): boolean {
  return grant.resource === CREDIT_RESOURCE
    && grant.unit === CREDIT_UNIT
    && grant.quantity === plan.quantity
    && grant.period_key === plan.periodKey
    && grant.period_start === plan.periodStart
    && grant.period_end === plan.periodEnd
    && grant.grant_type === 'reset'
    && grant.reason === reason
    && grant.created_by === actor
    && grant.idempotency_key === plan.idempotencyKey
    && grant.applied_at !== null
    && grant.created_at.length > 0
}

function buildResidual(
  input: HistoricalUsageReconciliationInput,
  period: HistoricalUsageReconciliationPeriod,
  quantity: number,
  canonicalQuantityBefore: number,
  canonicalQuantityAfter: number,
  lifetimeUsed: number,
): HistoricalUsageResidualPlan | null {
  if (quantity <= 0) return null
  const createdAt = new Date(Date.parse(period.start) - 1).toISOString()
  const metadata = {
    kind: 'historical_unattributed_usage',
    basis: 'lifetime_used_minus_canonical_credit_quantity',
    organizationId: input.organizationId,
    legacyLifetimeUsed: lifetimeUsed,
    canonicalQuantityBeforeBackfill: canonicalQuantityBefore,
    canonicalQuantityAfterBackfill: canonicalQuantityAfter,
    quantity,
  }
  return {
    quantity,
    id: residualKey(input.organizationId),
    idempotencyKey: residualKey(input.organizationId),
    createdAt,
    metadata,
  }
}

function buildReset(input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod, credits: CreditRow): HistoricalUsageResetPlan {
  return {
    required: credits.balance_period_key === null,
    quantity: credits.balance,
    id: resetId(input.organizationId, input.idempotencyKey),
    idempotencyKey: resetKey(input.organizationId, input.idempotencyKey),
    periodKey: period.key,
    periodStart: period.start,
    periodEnd: period.end,
  }
}

function invalidResidualEvent(): never {
  fail('canonical_usage_conflict', 409, 'Historical residual idempotency key is already used by a malformed event.')
}

function assertResidualEvent(event: CanonicalUsageEventRow, organizationId: string): void {
  const key = residualKey(organizationId)
  if (
    event.id !== key
    || event.organization_id !== organizationId
    || event.site_id !== null
    || event.resource !== CREDIT_RESOURCE
    || event.source !== 'historical_reconciliation'
    || event.provider !== 'ai'
    || event.channel !== 'historical'
    || event.unit !== CREDIT_UNIT
    || event.idempotency_key !== key
    || typeof event.created_at !== 'string'
    || !event.created_at.trim()
    || !Number.isFinite(Date.parse(event.created_at))
    || typeof event.quantity !== 'number'
    || !Number.isSafeInteger(event.quantity)
    || event.quantity <= 0
  ) {
    invalidResidualEvent()
  }

  const metadata = parseMetadata(event.metadata_json)
  if (!metadata) invalidResidualEvent()
  const keys = Object.keys(metadata).sort()
  const expectedKeys = ['basis', 'canonicalQuantityAfterBackfill', 'canonicalQuantityBeforeBackfill', 'kind', 'legacyLifetimeUsed', 'organizationId', 'quantity']
  if (keys.length !== expectedKeys.length || keys.some((keyName, index) => keyName !== expectedKeys[index])) invalidResidualEvent()
  if (
    metadata.kind !== 'historical_unattributed_usage'
    || metadata.basis !== 'lifetime_used_minus_canonical_credit_quantity'
    || metadata.organizationId !== organizationId
  ) {
    invalidResidualEvent()
  }

  const lifetimeUsed = metadata.legacyLifetimeUsed
  const canonicalBefore = metadata.canonicalQuantityBeforeBackfill
  const canonicalAfter = metadata.canonicalQuantityAfterBackfill
  const quantity = metadata.quantity
  if (
    typeof lifetimeUsed !== 'number' || !Number.isSafeInteger(lifetimeUsed) || lifetimeUsed < 0
    || typeof canonicalBefore !== 'number' || !Number.isSafeInteger(canonicalBefore) || canonicalBefore < 0
    || typeof canonicalAfter !== 'number' || !Number.isSafeInteger(canonicalAfter) || canonicalAfter < 0
    || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0
    || quantity !== event.quantity
    || canonicalAfter < canonicalBefore
    || !Number.isSafeInteger(canonicalAfter + quantity)
    || canonicalAfter + quantity !== lifetimeUsed
  ) {
    invalidResidualEvent()
  }
}

function residualConflict(event: CanonicalUsageEventRow | null, residual: HistoricalUsageResidualPlan | null, organizationId: string): void {
  if (!event) return
  assertResidualEvent(event, organizationId)
  if (!residual) return
  if (!exactResidualEvent(event, residual)) fail('canonical_usage_conflict', 409, 'Historical residual idempotency key is already used by a different event.')
}

function resetConflict(grant: CurrentGrantRow | null, reset: HistoricalUsageResetPlan, reason: string, actor: string): void {
  if (!grant || !reset.required) return
  if (!exactResetGrant(grant, reset, reason, actor)) fail('idempotency_conflict', 409, 'Historical reset idempotency key is already used by a different grant.')
}

function flatCase(column: string): string {
  return `CASE ${column} ${Object.entries(ACTION_CREDIT_COSTS).map(([action, quantity]) => `WHEN '${action}' THEN ${quantity}`).join(' ')} ELSE NULL END`
}

function resourceCase(column: string): string {
  return `CASE WHEN ${column} IN ('whatsapp_notification', 'whatsapp_free_text') THEN 'messaging' WHEN ${column} IN ('google_places_search', 'google_places_details') THEN 'maps_api' ELSE 'ai_inference' END`
}

function sourceCase(column: string): string {
  return `CASE WHEN ${column} IN ('whatsapp_notification', 'whatsapp_free_text') THEN 'notification' WHEN ${column} IN ('google_places_search', 'google_places_details') THEN 'places' ELSE 'historical_reconciliation' END`
}

function providerCase(column: string): string {
  return `CASE WHEN ${column} IN ('whatsapp_notification', 'whatsapp_free_text') THEN 'meta' WHEN ${column} IN ('google_places_search', 'google_places_details') THEN 'google' ELSE 'ai' END`
}

function channelCase(column: string): string {
  return `CASE WHEN ${column} IN ('whatsapp_notification', 'whatsapp_free_text') THEN 'whatsapp' WHEN ${column} IN ('google_places_search', 'google_places_details') THEN 'api' ELSE 'legacy' END`
}

function legacyFingerprintExpression(): string {
  return `(
    SELECT COALESCE(json_group_array(json_object(
      'id', id, 'organization_id', organization_id, 'site_id', site_id,
      'action', action, 'model', model, 'input_tokens', input_tokens,
      'output_tokens', output_tokens, 'credits_charged', credits_charged,
      'cf_gateway_log_id', cf_gateway_log_id, 'created_at', created_at
    )), '[]')
    FROM (
      SELECT id, organization_id, site_id, action, model, input_tokens,
             output_tokens, credits_charged, cf_gateway_log_id, created_at
      FROM ai_usage_log
      WHERE organization_id = ? AND created_at <= ?
      ORDER BY created_at ASC, id ASC
    )
  )`
}

function eventFingerprintExpression(): string {
  return `(
    SELECT COALESCE(json_group_array(json_object(
      'id', id, 'organization_id', organization_id, 'site_id', site_id,
      'resource', resource, 'source', source, 'provider', provider,
      'channel', channel, 'session_id', session_id, 'quantity', quantity,
      'unit', unit, 'metadata_json', metadata_json,
      'idempotency_key', idempotency_key, 'created_at', created_at
    )), '[]')
    FROM (
      SELECT id, organization_id, site_id, resource, source, provider,
             channel, session_id, quantity, unit, metadata_json,
             idempotency_key, created_at
      FROM usage_events
      WHERE organization_id = ?
      ORDER BY created_at ASC, id ASC
    )
  )`
}

function grantFingerprintExpression(): string {
  return `(
    SELECT COALESCE(json_group_array(json_object(
      'id', id, 'organization_id', organization_id, 'resource', resource,
      'quantity', quantity, 'unit', unit, 'period_key', period_key,
      'period_start', period_start, 'period_end', period_end,
      'grant_type', grant_type, 'reason', reason, 'created_by', created_by,
      'idempotency_key', idempotency_key, 'applied_at', applied_at,
      'created_at', created_at
    )), '[]')
    FROM (
      SELECT id, organization_id, resource, quantity, unit, period_key,
             period_start, period_end, grant_type, reason, created_by,
             idempotency_key, applied_at, created_at
      FROM usage_quota_grants
      WHERE organization_id = ?
      ORDER BY created_at ASC, id ASC
    )
  )`
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function quantityCase(column: string): string {
  return `COALESCE(${flatCase(column)}, ((input_tokens + output_tokens * 5 + 999) / 1000))`
}

function legacyAggregatePredicate(input: HistoricalUsageReconciliationInput, state: HistoricalUsageReconciliationState): { sql: string; params: unknown[] } {
  return {
    sql: `
      (SELECT COUNT(*) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?) = ?
      AND COALESCE((SELECT SUM(input_tokens) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?), 0) = ?
      AND COALESCE((SELECT SUM(output_tokens) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?), 0) = ?
      AND COALESCE((SELECT SUM(credits_charged) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?), 0) = ?
      AND COALESCE((SELECT SUM(${quantityCase('action')}) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?), 0) = ?
      AND (SELECT MAX(created_at) FROM ai_usage_log WHERE organization_id = ? AND created_at <= ?) IS ?
    `,
    params: [
      input.organizationId, input.cutoffAt, state.legacy.count,
      input.organizationId, input.cutoffAt, state.legacy.inputTokens,
      input.organizationId, input.cutoffAt, state.legacy.outputTokens,
      input.organizationId, input.cutoffAt, state.legacy.creditsCharged,
      input.organizationId, input.cutoffAt, state.legacy.derivedQuantity,
      input.organizationId, input.cutoffAt, state.legacy.latestCreatedAt,
    ],
  }
}

function statePredicate(input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod, state: HistoricalUsageReconciliationState): { sql: string; params: unknown[] } {
  const legacy = legacyAggregatePredicate(input, state)
  return {
    sql: `
      EXISTS (
        SELECT 1 FROM ai_credits
        WHERE organization_id = ?
          AND balance = ?
          AND lifetime_used = ?
          AND balance_period_key IS ?
          AND last_topped_up_at IS ?
          AND updated_at IS ?
      )
      AND ${legacy.sql}
      AND (SELECT COUNT(*) FROM usage_events WHERE organization_id = ? AND unit = 'credit') = ?
      AND (SELECT COALESCE(SUM(quantity), 0) FROM usage_events WHERE organization_id = ? AND unit = 'credit') = ?
      AND (SELECT MAX(created_at) FROM usage_events WHERE organization_id = ? AND unit = 'credit') IS ?
      AND (SELECT COUNT(*) FROM usage_quota_grants WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND period_start = ? AND period_end = ?) = ?
      AND (SELECT COALESCE(SUM(quantity), 0) FROM usage_quota_grants WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND period_start = ? AND period_end = ?) = ?
      AND (SELECT COALESCE(SUM(CASE WHEN applied_at IS NOT NULL THEN 1 ELSE 0 END), 0) FROM usage_quota_grants WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND period_start = ? AND period_end = ?) = ?
      AND (SELECT MAX(created_at) FROM usage_quota_grants WHERE organization_id = ? AND resource = 'ai_inference' AND unit = 'credit' AND period_start = ? AND period_end = ?) IS ?
      AND ${legacyFingerprintExpression()} = ?
      AND ${eventFingerprintExpression()} = ?
      AND ${grantFingerprintExpression()} = ?
      AND NOT EXISTS (SELECT 1 FROM usage_events WHERE organization_id = ? AND idempotency_key = ?)
    `,
    params: [
      input.organizationId,
      state.credits.balance,
      state.credits.lifetimeUsed,
      state.credits.balancePeriodKey,
      state.credits.lastToppedUpAt,
      state.credits.updatedAt,
      ...legacy.params,
      input.organizationId, state.canonical.count,
      input.organizationId, state.canonical.quantity,
      input.organizationId, state.canonical.latestCreatedAt,
      input.organizationId, period.start, period.end, state.grants.count,
      input.organizationId, period.start, period.end, state.grants.quantity,
      input.organizationId, period.start, period.end, state.grants.appliedCount,
      input.organizationId, period.start, period.end, state.grants.latestCreatedAt,
      input.organizationId, input.cutoffAt, state.fingerprints.legacy,
      input.organizationId, state.fingerprints.events,
      input.organizationId, state.fingerprints.grants,
      input.organizationId, markerKey(input.organizationId, input.idempotencyKey),
    ],
  }
}

function markerValues(
  input: HistoricalUsageReconciliationInput,
  actor: string,
  marker: Record<string, unknown>,
  now: string,
): unknown[] {
  return [
    markerId(input.organizationId, input.idempotencyKey),
    input.organizationId,
    null,
    AUDIT_RESOURCE,
    'historical_reconciliation',
    'internal',
    'operator',
    null,
    0,
    AUDIT_UNIT,
    JSON.stringify({ ...marker, actor }),
    markerKey(input.organizationId, input.idempotencyKey),
    now,
  ]
}

function markerColumns(): string {
  return `(id, organization_id, site_id, resource, source, provider, channel,
    session_id, quantity, unit, metadata_json, idempotency_key, created_at)`
}

function legacyInsertStatement(input: HistoricalUsageReconciliationInput): { query: string; params: unknown[] } {
  const quantity = quantityCase('l.action')
  const resource = resourceCase('l.action')
  const source = sourceCase('l.action')
  const provider = providerCase('l.action')
  const channel = channelCase('l.action')
  const historyPrefix = sqlStringLiteral(HISTORY_PREFIX)
  const flatActions = Object.keys(ACTION_CREDIT_COSTS).map(action => sqlStringLiteral(action)).join(', ')
  const flatQuantity = flatCase('l.action')
  return {
    query: `
      INSERT INTO usage_events
        (id, organization_id, site_id, resource, source, provider, channel,
         session_id, quantity, unit, metadata_json, idempotency_key, created_at)
      SELECT ${historyPrefix} || l.id, l.organization_id, l.site_id,
             ${resource}, ${source}, ${provider}, ${channel}, NULL,
             ${quantity}, 'credit',
             json_object(
               'action', l.action,
               'model', l.model,
               'inputTokens', l.input_tokens,
               'outputTokens', l.output_tokens,
               'cfGatewayLogId', l.cf_gateway_log_id,
               'historical', json_object(
                 'legacyLogId', l.id,
                 'legacyCreditsCharged', l.credits_charged,
                 'inputTokens', l.input_tokens,
                 'outputTokens', l.output_tokens,
                 'basis', CASE WHEN ${flatCase('l.action')} IS NOT NULL THEN 'flat' ELSE 'tokens' END
               )
             ),
             ${historyPrefix} || l.id, l.created_at
      FROM ai_usage_log l
      WHERE l.organization_id = ? AND l.created_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM usage_events h
          WHERE h.organization_id = l.organization_id
            AND h.idempotency_key = ${historyPrefix} || l.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM usage_events u
          WHERE u.organization_id = l.organization_id
            AND u.site_id IS l.site_id
            AND u.resource = ${resource}
            AND u.quantity = ${quantity}
            AND u.unit = 'credit'
            AND u.created_at = l.created_at
            AND json_valid(u.metadata_json)
            AND json_extract(u.metadata_json, '$.action') = l.action
            AND (
              (
                l.action IN (${flatActions})
                AND json_extract(u.metadata_json, '$.creditsCharged') = ${flatQuantity}
                AND json_extract(u.metadata_json, '$.charged') = CASE WHEN l.credits_charged = ${flatQuantity} THEN 1 ELSE 0 END
                AND (
                  (l.cf_gateway_log_id IS NULL AND json_type(u.metadata_json, '$.cfGatewayLogId') = 'null')
                  OR (l.cf_gateway_log_id IS NOT NULL AND json_extract(u.metadata_json, '$.cfGatewayLogId') = l.cf_gateway_log_id)
                )
              )
              OR (
                l.action NOT IN (${flatActions})
                AND json_extract(u.metadata_json, '$.model') = l.model
                AND json_extract(u.metadata_json, '$.inputTokens') = l.input_tokens
                AND json_extract(u.metadata_json, '$.outputTokens') = l.output_tokens
                AND (l.cf_gateway_log_id IS NULL OR json_extract(u.metadata_json, '$.cfGatewayLogId') = l.cf_gateway_log_id)
              )
            )
        )
    `,
    params: [input.organizationId, input.cutoffAt],
  }
}

function residualInsertStatement(input: HistoricalUsageReconciliationInput, residual: HistoricalUsageResidualPlan): { query: string; params: unknown[] } {
  return {
    query: `
      INSERT INTO usage_events
        (id, organization_id, site_id, resource, source, provider, channel,
         session_id, quantity, unit, metadata_json, idempotency_key, created_at)
      SELECT ?, ?, NULL, 'ai_inference', 'historical_reconciliation', 'ai', 'historical',
             NULL, ?, 'credit', ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM usage_events WHERE organization_id = ? AND idempotency_key = ?
      )
    `,
    params: [
      residual.id,
      input.organizationId,
      residual.quantity,
      JSON.stringify(residual.metadata),
      residual.idempotencyKey,
      residual.createdAt,
      input.organizationId,
      residual.idempotencyKey,
    ],
  }
}

function resetInsertStatement(input: HistoricalUsageReconciliationInput, actor: string, reason: string, reset: HistoricalUsageResetPlan, now: string): { query: string; params: unknown[] } {
  return {
    query: `
      INSERT INTO usage_quota_grants
        (id, organization_id, resource, quantity, unit, period_key, period_start,
         period_end, grant_type, reason, created_by, idempotency_key, applied_at, created_at)
      SELECT ?, ?, 'ai_inference', ?, 'credit', ?, ?, ?, 'reset', ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM usage_quota_grants WHERE organization_id = ? AND idempotency_key = ?
      )
    `,
    params: [
      reset.id,
      input.organizationId,
      reset.quantity,
      reset.periodKey,
      reset.periodStart,
      reset.periodEnd,
      reason,
      actor,
      reset.idempotencyKey,
      now,
      now,
      input.organizationId,
      reset.idempotencyKey,
    ],
  }
}

function resetCreditStatement(input: HistoricalUsageReconciliationInput, period: HistoricalUsageReconciliationPeriod, state: HistoricalUsageReconciliationState, now: string): { query: string; params: unknown[] } {
  return {
    query: `
      UPDATE ai_credits
      SET balance_period_key = ?, updated_at = ?
      WHERE organization_id = ?
        AND balance = ?
        AND lifetime_used = ?
        AND balance_period_key IS NULL
        AND last_topped_up_at IS ?
        AND updated_at IS ?
    `,
    params: [
      periodBalanceKey(period),
      now,
      input.organizationId,
      state.credits.balance,
      state.credits.lifetimeUsed,
      state.credits.lastToppedUpAt,
      state.credits.updatedAt,
    ],
  }
}

function markerQueryValues(values: unknown[], predicate: { sql: string; params: unknown[] }): { query: string; params: unknown[] } {
  return {
    query: `
      INSERT INTO usage_events ${markerColumns()}
      SELECT ${values.map(() => '?').join(', ')}
      WHERE NOT (${predicate.sql})
    `,
    params: [...values, ...predicate.params],
  }
}

function buildPlanData(
  context: ReadContext,
  input: HistoricalUsageReconciliationInput,
  period: HistoricalUsageReconciliationPeriod,
  actor: string,
): { legacy: HistoricalUsageLegacyPlan[]; residual: HistoricalUsageResidualPlan | null; reset: HistoricalUsageResetPlan; backfillCount: number; matchedCount: number; backfillQuantity: number } {
  const backfillQuantity = safeSum(context.legacyRows.filter(row => row.status === 'backfill').map(row => row.quantity), 'backfill quantity')
  const canonicalAfterBackfill = context.state.canonical.quantity + backfillQuantity
  if (canonicalAfterBackfill > context.state.credits.lifetimeUsed) {
    fail('lifetime_usage_conflict', 409, 'Canonical credit usage exceeds ai_credits.lifetime_used.')
  }
  const residualQuantity = context.state.credits.lifetimeUsed - canonicalAfterBackfill
  const residual = buildResidual(input, period, residualQuantity, context.state.canonical.quantity, canonicalAfterBackfill, context.state.credits.lifetimeUsed)
  residualConflict(context.residualEvent, residual, input.organizationId)
  const reset = buildReset(input, period, context.credits)
  resetConflict(context.resetGrant, reset, input.reason, actor)
  return {
    legacy: context.legacyRows,
    residual,
    reset,
    backfillCount: context.legacyRows.filter(row => row.status === 'backfill').length,
    matchedCount: context.legacyRows.filter(row => row.status === 'matched').length,
    backfillQuantity,
  }
}

export async function previewHistoricalUsageReconciliation(
  db: DbClient,
  secret: string,
  input: HistoricalUsageReconciliationInput,
  actor: string,
  now = new Date(),
): Promise<HistoricalUsageReconciliationPlan> {
  const period = currentPeriod(now)
  const context = await readContext(db, input, period)
  if (context.marker && !markerMatchesRequest(context.marker, input, actor, period)) {
    fail('idempotency_conflict', 409, 'Reconciliation idempotency key is already used by a different operation.')
  }
  const planData = buildPlanData(context, input, period, actor)
  const expectedStateSha256 = await sha256CanonicalJson(context.state)
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
    approvalFailure(error)
  }
  return {
    actor,
    input,
    period,
    state: context.state,
    expectedStateSha256,
    expiresAt,
    approvalToken,
    legacyLogs: planData.legacy,
    backfillCount: planData.backfillCount,
    matchedCount: planData.matchedCount,
    backfillQuantity: planData.backfillQuantity,
    residual: planData.residual,
    reset: planData.reset,
    markerId: markerId(input.organizationId, input.idempotencyKey),
    markerIdempotencyKey: markerKey(input.organizationId, input.idempotencyKey),
  }
}

function markerResult(
  status: 'applied' | 'already_applied',
  input: HistoricalUsageReconciliationInput,
  marker: OperationMarker,
  actor: string,
  period: HistoricalUsageReconciliationPeriod,
): HistoricalUsageReconciliationResult {
  const audit = markerAuditResult(marker, actor, input, period)
  if (!audit) fail('idempotency_conflict', 409, 'Reconciliation audit marker is malformed.')
  return {
    status,
    organizationId: input.organizationId,
    cutoffAt: input.cutoffAt,
    backfillCount: audit.backfillCount,
    matchedCount: audit.matchedCount,
    residualQuantity: audit.residualQuantity,
    resetApplied: audit.resetApplied,
    markerId: marker.id,
  }
}

export async function applyHistoricalUsageReconciliation(
  db: DbClient,
  secret: string,
  input: HistoricalUsageReconciliationInput,
  actor: string,
  expectedStateSha256: string,
  approvalToken: string,
  now = new Date(),
): Promise<HistoricalUsageReconciliationResult> {
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
    approvalFailure(error)
  }

  const context = await readContext(db, input, period)
  if (context.marker) {
    if (!markerMatchesRequest(context.marker, input, actor, period)) {
      fail('idempotency_conflict', 409, 'Reconciliation idempotency key is already used by a different operation.')
    }
    return markerResult('already_applied', input, context.marker, actor, period)
  }
  const actualStateSha256 = await sha256CanonicalJson(context.state)
  if (actualStateSha256 !== expectedStateSha256) fail('stale_state', 409, 'Reviewed reconciliation state is stale; create a new preview.')
  const planData = buildPlanData(context, input, period, actor)
  const nowIso = now.toISOString()
  const metadata = markerMetadata(input, actor, period, {
    stateSha256: expectedStateSha256,
    backfillCount: planData.backfillCount,
    matchedCount: planData.matchedCount,
    backfillQuantity: planData.backfillQuantity,
    residualQuantity: planData.residual?.quantity ?? 0,
    resetApplied: planData.reset.required,
  })
  const values = markerValues(input, actor, metadata, nowIso)
  const predicate = statePredicate(input, period, context.state)
  const statements: Array<{ query: string; params: unknown[] }> = [
    markerQueryValues(values, predicate),
    {
      query: `INSERT INTO usage_events ${markerColumns()} VALUES (${values.map(() => '?').join(', ')})`,
      params: values,
    },
    legacyInsertStatement(input),
  ]
  if (planData.residual) statements.push(residualInsertStatement(input, planData.residual))
  if (planData.reset.required) {
    statements.push(resetInsertStatement(input, actor, input.reason, planData.reset, nowIso))
    statements.push(resetCreditStatement(input, period, context.state, nowIso))
  }

  try {
    await executeBatch(db, statements)
  } catch (error) {
    let after: ReadContext
    try {
      after = await readContext(db, input, period)
    } catch (readError) {
      if (readError instanceof HistoricalUsageReconciliationError
        && (readError.code === 'canonical_usage_conflict' || readError.code === 'legacy_usage_invalid')) {
        fail('stale_state', 409, 'Reviewed reconciliation state is stale; create a new preview.')
      }
      throw readError
    }
    if (after.marker && markerMatchesRequest(after.marker, input, actor, period)) return markerResult('already_applied', input, after.marker, actor, period)
    const afterHash = await sha256CanonicalJson(after.state)
    if (afterHash !== expectedStateSha256) fail('stale_state', 409, 'Reviewed reconciliation state is stale; create a new preview.')
    console.error('historical_usage_reconciliation_batch_failed', {
      organizationId: input.organizationId,
      cutoffAt: input.cutoffAt,
      error: error instanceof Error ? error.message : String(error),
    })
    fail('reconciliation_failed', 500, 'Historical usage reconciliation could not be applied.')
  }

  return {
    status: 'applied',
    organizationId: input.organizationId,
    cutoffAt: input.cutoffAt,
    backfillCount: planData.backfillCount,
    matchedCount: planData.matchedCount,
    residualQuantity: planData.residual?.quantity ?? 0,
    resetApplied: planData.reset.required,
    markerId: markerId(input.organizationId, input.idempotencyKey),
  }
}
