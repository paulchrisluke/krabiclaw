export const MERCHANT_HANDOFF_CAPABILITIES = [
  'order_notification',
  'order_fetch',
  'order_accept',
  'order_deny',
  'ready_time_update',
  'order_ready',
  'order_cancel',
  'order_complete',
] as const

export type MerchantHandoffCapability = typeof MERCHANT_HANDOFF_CAPABILITIES[number]
export type MerchantOrderState = 'pending' | 'accepted' | 'denied' | 'cancelled'
export type MerchantFulfillmentState = 'unstarted' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type MerchantCommandType = 'accept' | 'deny' | 'ready_time_update' | 'ready' | 'cancel' | 'complete'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export interface MerchantProviderMappings {
  [key: string]: JsonValue
  provider: string
  location_id: string
  order_id: string | null
}

interface CommandEnvelope {
  id: string
  version: 1
  resource: {
    id: string
    version: number
  }
  expected_state_version: number
  provider_mappings: MerchantProviderMappings
  idempotency_key: string
}

export type MerchantCommand =
  | CommandEnvelope & { type: 'accept'; snapshot: { accepted_at: string } }
  | CommandEnvelope & { type: 'deny'; snapshot: { denied_at: string; reason_code: string; reason: string | null } }
  | CommandEnvelope & { type: 'ready_time_update'; snapshot: { ready_at: string } }
  | CommandEnvelope & { type: 'ready'; snapshot: { ready_at: string } }
  | CommandEnvelope & { type: 'cancel'; snapshot: { cancelled_at: string; reason_code: string; reason: string | null } }
  | CommandEnvelope & { type: 'complete'; snapshot: { completed_at: string } }

export interface MerchantHandoffState {
  merchant_state: MerchantOrderState
  fulfillment_state: MerchantFulfillmentState
  state_version: number
  ready_at: string | null
}

export type MerchantCommandDecision =
  | { ok: true; status: 'applied' | 'denied'; state: MerchantHandoffState }
  | { ok: false; code: 'state_version_conflict' | 'invalid_transition'; message: string }

const CAPABILITY_SET = new Set<string>(MERCHANT_HANDOFF_CAPABILITIES)
const COMMAND_CAPABILITIES = {
  accept: 'order_accept',
  deny: 'order_deny',
  ready_time_update: 'ready_time_update',
  ready: 'order_ready',
  cancel: 'order_cancel',
  complete: 'order_complete',
} as const satisfies Record<MerchantCommandType, MerchantHandoffCapability>

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const extras = Object.keys(value).filter(key => !allowed.includes(key)).sort()
  if (extras.length > 0) throw new TypeError(`${field} has unknown fields: ${extras.join(', ')}`)
}

function string(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty string with at most ${maxLength} characters`)
  }
  return value.trim()
}

function nullableString(value: unknown, field: string, maxLength: number): string | null {
  if (value === null) return null
  return string(value, field, maxLength)
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new TypeError(`${field} must be a positive integer`)
  return Number(value)
}

function isoTimestamp(value: unknown, field: string): string {
  const parsed = string(value, field, 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new TypeError(`${field} must be a UTC ISO timestamp`)
  }
  return parsed
}

export function parseMerchantProviderMappings(value: unknown): MerchantProviderMappings {
  const input = record(value, 'provider_mappings')
  exactFields(input, ['provider', 'location_id', 'order_id'], 'provider_mappings')
  return {
    provider: string(input.provider, 'provider_mappings.provider', 100),
    location_id: string(input.location_id, 'provider_mappings.location_id', 200),
    order_id: input.order_id === null ? null : string(input.order_id, 'provider_mappings.order_id', 200),
  }
}

function commandBase(value: Record<string, unknown>, type: MerchantCommandType): CommandEnvelope {
  if (value.type !== type) throw new TypeError(`type must be ${type}`)
  if (value.version !== 1) throw new TypeError('version must be 1')
  const resource = record(value.resource, 'resource')
  exactFields(resource, ['id', 'version'], 'resource')
  return {
    id: string(value.id, 'id', 200),
    version: 1,
    resource: {
      id: string(resource.id, 'resource.id', 200),
      version: positiveInteger(resource.version, 'resource.version'),
    },
    expected_state_version: positiveInteger(value.expected_state_version, 'expected_state_version'),
    provider_mappings: parseMerchantProviderMappings(value.provider_mappings),
    idempotency_key: string(value.idempotency_key, 'idempotency_key', 200),
  }
}

export function parseMerchantCommand(value: unknown): MerchantCommand {
  const input = record(value, 'command')
  exactFields(input, ['id', 'version', 'type', 'resource', 'expected_state_version', 'provider_mappings', 'idempotency_key', 'snapshot'], 'command')
  const type = string(input.type, 'type', 30)
  const snapshot = record(input.snapshot, 'snapshot')
  if (type === 'accept') {
    exactFields(snapshot, ['accepted_at'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { accepted_at: isoTimestamp(snapshot.accepted_at, 'snapshot.accepted_at') } }
  }
  if (type === 'deny') {
    exactFields(snapshot, ['denied_at', 'reason_code', 'reason'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { denied_at: isoTimestamp(snapshot.denied_at, 'snapshot.denied_at'), reason_code: string(snapshot.reason_code, 'snapshot.reason_code', 100), reason: nullableString(snapshot.reason, 'snapshot.reason', 500) } }
  }
  if (type === 'ready_time_update') {
    exactFields(snapshot, ['ready_at'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { ready_at: isoTimestamp(snapshot.ready_at, 'snapshot.ready_at') } }
  }
  if (type === 'ready') {
    exactFields(snapshot, ['ready_at'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { ready_at: isoTimestamp(snapshot.ready_at, 'snapshot.ready_at') } }
  }
  if (type === 'cancel') {
    exactFields(snapshot, ['cancelled_at', 'reason_code', 'reason'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { cancelled_at: isoTimestamp(snapshot.cancelled_at, 'snapshot.cancelled_at'), reason_code: string(snapshot.reason_code, 'snapshot.reason_code', 100), reason: nullableString(snapshot.reason, 'snapshot.reason', 500) } }
  }
  if (type === 'complete') {
    exactFields(snapshot, ['completed_at'], 'snapshot')
    return { ...commandBase(input, type), type, snapshot: { completed_at: isoTimestamp(snapshot.completed_at, 'snapshot.completed_at') } }
  }
  throw new TypeError(`type must be one of: ${Object.keys(COMMAND_CAPABILITIES).join(', ')}`)
}

export function parseMerchantHandoffCapabilities(value: unknown): MerchantHandoffCapability[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('capabilities must be a non-empty array')
  const capabilities = value.map((item, index) => string(item, `capabilities[${index}]`, 50))
  const invalid = capabilities.filter(capability => !CAPABILITY_SET.has(capability))
  if (invalid.length > 0) throw new TypeError(`Unsupported merchant handoff capabilities: ${[...new Set(invalid)].join(', ')}`)
  if (new Set(capabilities).size !== capabilities.length) throw new TypeError('capabilities must not contain duplicates')
  if (!capabilities.includes('order_notification') || !capabilities.includes('order_fetch')) {
    throw new TypeError('capabilities must include order_notification and order_fetch')
  }
  return capabilities as MerchantHandoffCapability[]
}

export function capabilityForCommand(type: MerchantCommandType): MerchantHandoffCapability {
  return COMMAND_CAPABILITIES[type]
}

export function applyMerchantCommand(state: MerchantHandoffState, command: MerchantCommand): MerchantCommandDecision {
  if (command.expected_state_version !== state.state_version) {
    return { ok: false, code: 'state_version_conflict', message: `Expected state version ${command.expected_state_version}, current version is ${state.state_version}` }
  }

  const nextVersion = state.state_version + 1
  if (command.type === 'accept' && state.merchant_state === 'pending' && state.fulfillment_state === 'unstarted') {
    return { ok: true, status: 'applied', state: { merchant_state: 'accepted', fulfillment_state: 'preparing', state_version: nextVersion, ready_at: null } }
  }
  if (command.type === 'deny' && state.merchant_state === 'pending' && state.fulfillment_state === 'unstarted') {
    return { ok: true, status: 'denied', state: { merchant_state: 'denied', fulfillment_state: 'cancelled', state_version: nextVersion, ready_at: null } }
  }
  if (command.type === 'ready_time_update' && state.merchant_state === 'accepted' && state.fulfillment_state === 'preparing') {
    return { ok: true, status: 'applied', state: { ...state, state_version: nextVersion, ready_at: command.snapshot.ready_at } }
  }
  if (command.type === 'ready' && state.merchant_state === 'accepted' && state.fulfillment_state === 'preparing') {
    return { ok: true, status: 'applied', state: { ...state, fulfillment_state: 'ready', state_version: nextVersion, ready_at: command.snapshot.ready_at } }
  }
  if (command.type === 'cancel' && ['pending', 'accepted'].includes(state.merchant_state) && state.fulfillment_state !== 'completed') {
    return { ok: true, status: 'applied', state: { merchant_state: 'cancelled', fulfillment_state: 'cancelled', state_version: nextVersion, ready_at: state.ready_at } }
  }
  if (command.type === 'complete' && state.merchant_state === 'accepted' && state.fulfillment_state === 'ready') {
    return { ok: true, status: 'applied', state: { ...state, fulfillment_state: 'completed', state_version: nextVersion } }
  }

  return {
    ok: false,
    code: 'invalid_transition',
    message: `${command.type} is not valid while merchant state is ${state.merchant_state} and fulfillment state is ${state.fulfillment_state}`,
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value !== 'object') throw new TypeError('Value is not JSON serializable')
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

export function sameProviderMappings(left: MerchantProviderMappings, right: MerchantProviderMappings): boolean {
  return left.provider === right.provider && left.location_id === right.location_id && left.order_id === right.order_id
}

export function parseMerchantHandoffState(value: unknown): MerchantHandoffState {
  const input = record(value, 'merchant state')
  exactFields(input, ['merchant_state', 'fulfillment_state', 'state_version', 'ready_at'], 'merchant state')
  if (!['pending', 'accepted', 'denied', 'cancelled'].includes(String(input.merchant_state))) throw new TypeError('merchant_state is invalid')
  if (!['unstarted', 'preparing', 'ready', 'completed', 'cancelled'].includes(String(input.fulfillment_state))) throw new TypeError('fulfillment_state is invalid')
  if (input.ready_at !== null) isoTimestamp(input.ready_at, 'ready_at')
  return {
    merchant_state: input.merchant_state as MerchantOrderState,
    fulfillment_state: input.fulfillment_state as MerchantFulfillmentState,
    state_version: positiveInteger(input.state_version, 'state_version'),
    ready_at: input.ready_at === null ? null : String(input.ready_at),
  }
}
