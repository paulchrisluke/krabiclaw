import { createHash } from 'node:crypto'
import { execute, executeBatch, queryFirst, type DbClient } from '~/server/db'
import {
  applyMerchantCommand,
  canonicalJson,
  capabilityForCommand,
  parseMerchantHandoffCapabilities,
  parseMerchantHandoffState,
  parseMerchantProviderMappings,
  sameProviderMappings,
  type JsonObject,
  type MerchantCommand,
  type MerchantHandoffCapability,
  type MerchantHandoffState,
  type MerchantProviderMappings,
} from '~/server/domain/merchant-handoff/contract'

interface DestinationRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  version: number
  status: 'active' | 'inactive'
  endpoint_url: string
  oauth_client_id: string
  provider: string
  provider_location_id: string
  capabilities_json: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface OrderRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  destination_id: string
  destination_version: number
  order_version: number
  provider_order_id: string | null
  provider_mappings_json: string
  order_snapshot_json: string
  merchant_state: MerchantHandoffState['merchant_state']
  fulfillment_state: MerchantHandoffState['fulfillment_state']
  state_version: number
  ready_at: string | null
  last_command_id: string | null
  created_at: string
  updated_at: string
}

interface DeliveryRow {
  id: string
  order_id: string
  idempotency_key: string
  request_hash: string
  payload_snapshot_json: string
  status: 'pending' | 'delivered' | 'failed'
  provider_status_code: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
  delivered_at: string | null
  failed_at: string | null
}

interface CommandRow {
  id: string
  order_id: string
  idempotency_key: string
  request_hash: string
  status: 'pending' | 'applied' | 'denied' | 'error'
  result_snapshot_json: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

interface OrderDestinationRow extends OrderRow {
  destination_join_id: string
  destination_oauth_client_id: string
  destination_capabilities_json: string
  destination_endpoint_url: string
  destination_provider: string
  destination_provider_location_id: string
  destination_status: string
  destination_current_version: number
  destination_created_by: string | null
  destination_created_at: string
  destination_updated_at: string
}

export interface MerchantHandoffDestination {
  id: string
  version: number
  organization_id: string
  site_id: string
  location_id: string
  status: 'active' | 'inactive'
  endpoint_url: string
  oauth_client_id: string
  provider_mappings: Pick<MerchantProviderMappings, 'provider' | 'location_id'>
  capabilities: MerchantHandoffCapability[]
  created_at: string
  updated_at: string
}

export interface ActivateMerchantHandoffDestinationInput {
  organizationId: string
  siteId: string
  locationId: string
  endpointUrl: string
  oauthClientId: string
  provider: string
  providerLocationId: string
  capabilities: MerchantHandoffCapability[]
  createdBy: string
}

export interface NotifyMerchantHandoffOrderInput {
  organizationId: string
  siteId: string
  locationId: string
  orderId: string
  orderVersion: number
  providerOrderId: string | null
  orderSnapshot: JsonObject
  idempotencyKey: string
  resourceBaseUrl: string
  allowLocalEndpoint?: boolean
  fetcher?: typeof fetch
}

export interface MerchantOrderContract {
  resource: { id: string; version: number }
  destination: { id: string; version: number; location_id: string; capabilities: MerchantHandoffCapability[] }
  provider_mappings: MerchantProviderMappings
  snapshot: JsonObject
  integration_delivery: {
    status: DeliveryRow['status']
    event_id: string
    delivered_at: string | null
    failed_at: string | null
    error: { code: string; message: string } | null
  }
  merchant: MerchantHandoffState
}

export type MerchantNotificationOutcome =
  | { ok: true; replayed: boolean; notification: JsonObject; order: MerchantOrderContract }
  | { ok: false; replayed: boolean; code: string; message: string; notification: JsonObject; order: MerchantOrderContract }

export type MerchantCommandOutcome =
  | { ok: true; replayed: boolean; command_id: string; status: 'applied' | 'denied'; merchant: MerchantHandoffState }
  | { ok: false; replayed: boolean; command_id: string; code: string; message: string; merchant: MerchantHandoffState }

export class MerchantHandoffError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(
    code: string,
    statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'MerchantHandoffError'
    this.code = code
    this.statusCode = statusCode
  }
}

function requiredString(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new MerchantHandoffError('invalid_request', 400, `${field} must be a non-empty string with at most ${maxLength} characters`)
  return normalized
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new MerchantHandoffError('invalid_request', 400, `${field} must be a positive integer`)
  return value
}

function parseJsonObject(value: string, field: string): JsonObject {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Stored ${field} is not an object`)
  return parsed as JsonObject
}

function destinationView(row: DestinationRow): MerchantHandoffDestination {
  const mappings = parseMerchantProviderMappings({
    provider: row.provider,
    location_id: row.provider_location_id,
    order_id: null,
  })
  return {
    id: row.id,
    version: row.version,
    organization_id: row.organization_id,
    site_id: row.site_id,
    location_id: row.location_id,
    status: row.status,
    endpoint_url: row.endpoint_url,
    oauth_client_id: row.oauth_client_id,
    provider_mappings: { provider: mappings.provider, location_id: mappings.location_id },
    capabilities: parseMerchantHandoffCapabilities(JSON.parse(row.capabilities_json)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function stateOf(row: OrderRow): MerchantHandoffState {
  return {
    merchant_state: row.merchant_state,
    fulfillment_state: row.fulfillment_state,
    state_version: row.state_version,
    ready_at: row.ready_at,
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function endpointUrl(value: string, allowLocal: boolean): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new MerchantHandoffError('invalid_endpoint', 400, 'endpoint_url must be an absolute URL')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new MerchantHandoffError('invalid_endpoint', 400, 'endpoint_url must not contain credentials, a query, or a fragment')
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  if (url.protocol !== 'https:' && !(allowLocal && isLocal && url.protocol === 'http:')) {
    throw new MerchantHandoffError('invalid_endpoint', 400, 'endpoint_url must use HTTPS')
  }
  if (!allowLocal && isPrivateEndpointHost(hostname)) {
    throw new MerchantHandoffError('invalid_endpoint', 400, 'endpoint_url must not target a local or private network host')
  }
  return url.toString()
}

function isPrivateEndpointHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return true
  if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe8') || hostname.startsWith('fe9') || hostname.startsWith('fea') || hostname.startsWith('feb')) return true
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [first = -1, second = -1] = octets
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export async function getActiveMerchantHandoffDestination(
  db: DbClient,
  scope: { organizationId: string; siteId: string; locationId: string },
): Promise<MerchantHandoffDestination | null> {
  const row = await queryFirst<DestinationRow>(db, `
    SELECT * FROM merchant_handoff_destinations
    WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'active'
    LIMIT 1
  `, [scope.organizationId, scope.siteId, scope.locationId])
  return row ? destinationView(row) : null
}

export async function activateMerchantHandoffDestination(
  db: DbClient,
  input: ActivateMerchantHandoffDestinationInput,
): Promise<MerchantHandoffDestination> {
  const endpoint = endpointUrl(input.endpointUrl, false)
  const oauthClientId = requiredString(input.oauthClientId, 'oauth_client_id', 200)
  const provider = requiredString(input.provider, 'provider', 100)
  const providerLocationId = requiredString(input.providerLocationId, 'provider_location_id', 200)
  const capabilities = parseMerchantHandoffCapabilities(input.capabilities)
  const capabilitiesJson = canonicalJson([...capabilities].sort())
  const current = await getActiveMerchantHandoffDestination(db, input)
  if (
    current
    && current.endpoint_url === endpoint
    && current.oauth_client_id === oauthClientId
    && current.provider_mappings.provider === provider
    && current.provider_mappings.location_id === providerLocationId
    && canonicalJson([...current.capabilities].sort()) === capabilitiesJson
  ) return current

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const versionRow = await queryFirst<{ latest_version: number | null }>(db, `
    SELECT MAX(version) AS latest_version
    FROM merchant_handoff_destinations
    WHERE organization_id = ? AND site_id = ? AND location_id = ?
  `, [input.organizationId, input.siteId, input.locationId])
  const version = Number(versionRow?.latest_version ?? 0) + 1
  await executeBatch(db, [
    {
      query: `UPDATE merchant_handoff_destinations SET status = 'inactive', updated_at = ? WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'active'`,
      params: [now, input.organizationId, input.siteId, input.locationId],
    },
    {
      query: `INSERT INTO merchant_handoff_destinations
        (id, organization_id, site_id, location_id, version, status, endpoint_url, oauth_client_id, provider, provider_location_id, capabilities_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, input.organizationId, input.siteId, input.locationId, version, endpoint, oauthClientId, provider, providerLocationId, capabilitiesJson, input.createdBy, now, now],
    },
  ], { operation: 'activate merchant handoff destination' })
  const created = await queryFirst<DestinationRow>(db, `SELECT * FROM merchant_handoff_destinations WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error(`Merchant handoff destination ${id} was not created`)
  return destinationView(created)
}

export async function deactivateMerchantHandoffDestination(
  db: DbClient,
  scope: { organizationId: string; siteId: string; locationId: string },
): Promise<boolean> {
  const now = new Date().toISOString()
  const result = await execute(db, `
    UPDATE merchant_handoff_destinations
    SET status = 'inactive', updated_at = ?
    WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'active'
  `, [now, scope.organizationId, scope.siteId, scope.locationId])
  return Number(result.meta.changes ?? 0) === 1
}

function deliveryResult(delivery: DeliveryRow, order: MerchantOrderContract, notification: JsonObject, replayed: boolean): MerchantNotificationOutcome {
  if (delivery.status === 'delivered') return { ok: true, replayed, notification, order }
  return {
    ok: false,
    replayed,
    code: delivery.error_code ?? (delivery.status === 'pending' ? 'delivery_in_progress' : 'delivery_failed'),
    message: delivery.error_message ?? (delivery.status === 'pending' ? 'The notification is already being delivered' : 'The receiver rejected the notification'),
    notification,
    order,
  }
}

async function replayedDeliveryResult(
  db: DbClient,
  delivery: DeliveryRow,
  order: OrderRow,
  notification: JsonObject,
): Promise<MerchantNotificationOutcome> {
  let resolved = delivery
  if (delivery.status === 'pending' && delivery.created_at <= new Date(Date.now() - 120_000).toISOString()) {
    const failedAt = new Date().toISOString()
    await execute(db, `
      UPDATE merchant_handoff_deliveries
      SET status = 'failed', error_code = 'delivery_interrupted', error_message = ?, failed_at = ?
      WHERE id = ? AND status = 'pending'
    `, ['The original synchronous delivery did not reach a terminal result', failedAt, delivery.id])
    const reconciled = await queryFirst<DeliveryRow>(db, `SELECT * FROM merchant_handoff_deliveries WHERE id = ? LIMIT 1`, [delivery.id])
    if (!reconciled) throw new Error(`Merchant handoff delivery ${delivery.id} disappeared`)
    resolved = reconciled
  }
  return deliveryResult(resolved, await orderContract(db, order, resolved), notification, true)
}

function sameImmutableOrder(
  order: OrderRow,
  input: NotifyMerchantHandoffOrderInput,
  destinationId: string,
  orderVersion: number,
  providerMappingsJson: string,
  snapshotJson: string,
): boolean {
  return order.organization_id === input.organizationId
    && order.site_id === input.siteId
    && order.location_id === input.locationId
    && order.destination_id === destinationId
    && order.order_version === orderVersion
    && order.provider_mappings_json === providerMappingsJson
    && order.order_snapshot_json === snapshotJson
}

async function orderContract(db: DbClient, order: OrderRow, delivery?: DeliveryRow): Promise<MerchantOrderContract> {
  const destination = await queryFirst<DestinationRow>(db, `SELECT * FROM merchant_handoff_destinations WHERE id = ? LIMIT 1`, [order.destination_id])
  if (!destination) throw new Error(`Merchant handoff destination ${order.destination_id} is missing`)
  const resolvedDelivery = delivery ?? await queryFirst<DeliveryRow>(db, `
    SELECT * FROM merchant_handoff_deliveries WHERE order_id = ? ORDER BY created_at DESC LIMIT 1
  `, [order.id])
  if (!resolvedDelivery) throw new Error(`Merchant handoff order ${order.id} has no notification delivery`)
  return {
    resource: { id: order.id, version: order.order_version },
    destination: { id: destination.id, version: order.destination_version, location_id: order.location_id, capabilities: parseMerchantHandoffCapabilities(JSON.parse(destination.capabilities_json)) },
    provider_mappings: parseMerchantProviderMappings(JSON.parse(order.provider_mappings_json)),
    snapshot: parseJsonObject(order.order_snapshot_json, 'order snapshot'),
    integration_delivery: {
      status: resolvedDelivery.status,
      event_id: resolvedDelivery.id,
      delivered_at: resolvedDelivery.delivered_at,
      failed_at: resolvedDelivery.failed_at,
      error: resolvedDelivery.error_code ? { code: resolvedDelivery.error_code, message: resolvedDelivery.error_message ?? 'Delivery failed' } : null,
    },
    merchant: stateOf(order),
  }
}

export async function notifyMerchantHandoffOrder(
  db: DbClient,
  input: NotifyMerchantHandoffOrderInput,
): Promise<MerchantNotificationOutcome> {
  const destination = await getActiveMerchantHandoffDestination(db, input)
  if (!destination) throw new MerchantHandoffError('destination_unavailable', 409, 'No active merchant handoff destination is configured for this location')
  const deliveryEndpoint = endpointUrl(destination.endpoint_url, input.allowLocalEndpoint === true)
  const orderId = requiredString(input.orderId, 'order_id', 200)
  const orderVersion = positiveInteger(input.orderVersion, 'order_version')
  const idempotencyKey = requiredString(input.idempotencyKey, 'idempotency_key', 200)
  const providerMappings: MerchantProviderMappings = {
    provider: destination.provider_mappings.provider,
    location_id: destination.provider_mappings.location_id,
    order_id: input.providerOrderId === null ? null : requiredString(input.providerOrderId, 'provider_order_id', 200),
  }
  const snapshotJson = canonicalJson(input.orderSnapshot)
  const providerMappingsJson = canonicalJson(providerMappings)
  if (snapshotJson.length > 200_000) throw new MerchantHandoffError('invalid_request', 413, 'order_snapshot exceeds 200000 characters')
  const now = new Date().toISOString()
  const eventId = crypto.randomUUID()
  const notification = {
    id: eventId,
    version: 1,
    type: 'order.notification',
    occurred_at: now,
    idempotency_key: idempotencyKey,
    resource: { id: orderId, version: orderVersion },
    destination: { id: destination.id, version: destination.version, location_id: input.locationId },
    provider_mappings: providerMappings,
    snapshot: { order_id: orderId, order_version: orderVersion },
    fetch_url: new URL(`/api/integrations/merchant-handoff/orders/${encodeURIComponent(orderId)}`, input.resourceBaseUrl).toString(),
  } satisfies JsonObject
  const requestHash = sha256({
    destination_id: destination.id,
    order_id: orderId,
    order_version: orderVersion,
    provider_mappings: providerMappings,
    order_snapshot: input.orderSnapshot,
    notification: { ...notification, id: null, occurred_at: null },
  })

  const existingDelivery = await queryFirst<DeliveryRow>(db, `
    SELECT * FROM merchant_handoff_deliveries WHERE order_id = ? AND order_version = ? LIMIT 1
  `, [orderId, orderVersion])
  if (existingDelivery) {
    if (existingDelivery.request_hash !== requestHash) throw new MerchantHandoffError('idempotency_conflict', 409, 'Idempotency key is already used by a different notification')
    const existingOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
    if (!existingOrder) throw new Error(`Merchant handoff delivery ${existingDelivery.id} has no order`)
    const storedNotification = parseJsonObject(existingDelivery.payload_snapshot_json, 'notification snapshot')
    return await replayedDeliveryResult(db, existingDelivery, existingOrder, storedNotification)
  }

  const existingOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
  if (existingOrder) {
    if (!sameImmutableOrder(existingOrder, input, destination.id, orderVersion, providerMappingsJson, snapshotJson)) {
      throw new MerchantHandoffError('immutable_order_conflict', 409, 'Order ID is already bound to a different immutable handoff snapshot')
    }
  } else {
    try {
      await execute(db, `INSERT INTO merchant_handoff_orders
        (id, organization_id, site_id, location_id, destination_id, destination_version, order_version, provider_order_id, provider_mappings_json, order_snapshot_json, merchant_state, fulfillment_state, state_version, ready_at, last_command_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unstarted', 1, NULL, NULL, ?, ?)`, [
        orderId, input.organizationId, input.siteId, input.locationId, destination.id, destination.version, orderVersion,
        providerMappings.order_id, providerMappingsJson, snapshotJson, now, now,
      ])
    } catch (error) {
      if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error
      const racedOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
      if (!racedOrder || !sameImmutableOrder(racedOrder, input, destination.id, orderVersion, providerMappingsJson, snapshotJson)) {
        throw new MerchantHandoffError('immutable_order_conflict', 409, 'Order ID is already bound to a different immutable handoff snapshot')
      }
    }
  }

  try {
    await execute(db, `INSERT INTO merchant_handoff_deliveries
      (id, organization_id, site_id, location_id, destination_id, order_id, event_version, order_version, idempotency_key, request_hash, payload_snapshot_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'pending', ?)`, [
      eventId, input.organizationId, input.siteId, input.locationId, destination.id, orderId, orderVersion,
      idempotencyKey, requestHash, canonicalJson(notification), now,
    ])
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error
    const raced = await queryFirst<DeliveryRow>(db, `SELECT * FROM merchant_handoff_deliveries WHERE order_id = ? AND order_version = ? LIMIT 1`, [orderId, orderVersion])
    if (!raced || raced.request_hash !== requestHash) throw new MerchantHandoffError('idempotency_conflict', 409, 'Idempotency key is already used by a different notification')
    const racedOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
    if (!racedOrder) throw new Error(`Merchant handoff delivery ${raced.id} has no order`)
    return await replayedDeliveryResult(db, raced, racedOrder, parseJsonObject(raced.payload_snapshot_json, 'notification snapshot'))
  }

  let providerStatusCode: number | null = null
  let errorCode: string | null = null
  let errorMessage: string | null = null
  try {
    const response = await (input.fetcher ?? fetch)(deliveryEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: canonicalJson(notification),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
    providerStatusCode = response.status
    if (!response.ok) {
      errorCode = 'provider_http_error'
      errorMessage = `Merchant receiver returned HTTP ${response.status}`
    }
  } catch (error) {
    errorCode = 'provider_network_error'
    errorMessage = error instanceof Error ? error.message.slice(0, 500) : 'Merchant receiver request failed'
  }

  const terminalAt = new Date().toISOString()
  await execute(db, `
    UPDATE merchant_handoff_deliveries
    SET status = ?, provider_status_code = ?, error_code = ?, error_message = ?, delivered_at = ?, failed_at = ?
    WHERE id = ? AND status = 'pending'
  `, [
    errorCode ? 'failed' : 'delivered', providerStatusCode, errorCode, errorMessage,
    errorCode ? null : terminalAt, errorCode ? terminalAt : null, eventId,
  ])
  const storedOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
  const storedDelivery = await queryFirst<DeliveryRow>(db, `SELECT * FROM merchant_handoff_deliveries WHERE id = ? LIMIT 1`, [eventId])
  if (!storedOrder || !storedDelivery) throw new Error(`Merchant handoff notification ${eventId} was not stored`)
  return deliveryResult(storedDelivery, await orderContract(db, storedOrder, storedDelivery), notification, false)
}

export async function getMerchantHandoffOrder(db: DbClient, orderId: string): Promise<{ order: OrderRow; destination: DestinationRow } | null> {
  return await queryFirst<OrderDestinationRow>(db, `
    SELECT o.*, d.id AS destination_join_id, d.oauth_client_id AS destination_oauth_client_id,
      d.capabilities_json AS destination_capabilities_json, d.endpoint_url AS destination_endpoint_url,
      d.provider AS destination_provider, d.provider_location_id AS destination_provider_location_id,
      d.status AS destination_status, d.version AS destination_current_version,
      d.created_by AS destination_created_by, d.created_at AS destination_created_at, d.updated_at AS destination_updated_at
    FROM merchant_handoff_orders o
    JOIN merchant_handoff_destinations d ON d.id = o.destination_id
    WHERE o.id = ?
    LIMIT 1
  `, [orderId]).then(row => row ? {
    order: row,
    destination: {
      id: String(row.destination_join_id),
      organization_id: row.organization_id,
      site_id: row.site_id,
      location_id: row.location_id,
      version: Number(row.destination_current_version),
      status: String(row.destination_status) === 'active' ? 'active' : 'inactive',
      endpoint_url: String(row.destination_endpoint_url),
      oauth_client_id: String(row.destination_oauth_client_id),
      provider: String(row.destination_provider),
      provider_location_id: String(row.destination_provider_location_id),
      capabilities_json: String(row.destination_capabilities_json),
      created_by: row.destination_created_by === null ? null : String(row.destination_created_by),
      created_at: String(row.destination_created_at),
      updated_at: String(row.destination_updated_at),
    },
  } : null)
}

export async function readMerchantHandoffOrder(db: DbClient, orderId: string): Promise<MerchantOrderContract | null> {
  const row = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [orderId])
  return row ? await orderContract(db, row) : null
}

function commandOutcome(row: CommandRow, order: OrderRow, replayed: boolean): MerchantCommandOutcome {
  const merchant = row.result_snapshot_json
    ? parseMerchantHandoffState(JSON.parse(row.result_snapshot_json))
    : stateOf(order)
  if (row.status === 'applied' || row.status === 'denied') {
    return { ok: true, replayed, command_id: row.id, status: row.status, merchant }
  }
  return {
    ok: false,
    replayed,
    command_id: row.id,
    code: row.error_code ?? 'command_in_progress',
    message: row.error_message ?? 'The command is already in progress',
    merchant,
  }
}

async function storedCommandOutcome(db: DbClient, command: MerchantCommand, requestHash: string): Promise<MerchantCommandOutcome | null> {
  const stored = await queryFirst<CommandRow>(db, `
    SELECT id, order_id, idempotency_key, request_hash, status, result_snapshot_json, error_code, error_message, created_at
    FROM merchant_handoff_commands
    WHERE id = ? OR (destination_id IN (SELECT destination_id FROM merchant_handoff_orders WHERE id = ?) AND idempotency_key = ?)
    LIMIT 1
  `, [command.id, command.resource.id, command.idempotency_key])
  if (!stored) return null
  if (stored.id !== command.id || stored.order_id !== command.resource.id || stored.request_hash !== requestHash) {
    throw new MerchantHandoffError('idempotency_conflict', 409, 'Command ID or idempotency key is already used by a different command')
  }
  const order = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [command.resource.id])
  if (!order) throw new Error(`Merchant command ${stored.id} has no order`)
  if (stored.status === 'pending' && order.last_command_id === stored.id) {
    const resultJson = canonicalJson(stateOf(order))
    await execute(db, `UPDATE merchant_handoff_commands SET status = ?, result_snapshot_json = ?, completed_at = ? WHERE id = ? AND status = 'pending'`, [
      command.type === 'deny' ? 'denied' : 'applied', resultJson, new Date().toISOString(), stored.id,
    ])
    const completed = await queryFirst<CommandRow>(db, `SELECT id, order_id, idempotency_key, request_hash, status, result_snapshot_json, error_code, error_message, created_at FROM merchant_handoff_commands WHERE id = ?`, [stored.id])
    if (!completed) throw new Error(`Merchant command ${stored.id} disappeared`)
    return commandOutcome(completed, order, true)
  }
  if (stored.status === 'pending' && stored.created_at <= new Date(Date.now() - 120_000).toISOString()) {
    const message = `Expected state version ${command.expected_state_version}, current version is ${order.state_version}`
    await execute(db, `UPDATE merchant_handoff_commands SET status = 'error', result_snapshot_json = ?, error_code = 'state_version_conflict', error_message = ?, completed_at = ? WHERE id = ? AND status = 'pending'`, [
      canonicalJson(stateOf(order)), message, new Date().toISOString(), stored.id,
    ])
    return { ok: false, replayed: true, command_id: stored.id, code: 'state_version_conflict', message, merchant: stateOf(order) }
  }
  return commandOutcome(stored, order, true)
}

async function storeCommandError(db: DbClient, commandId: string, state: MerchantHandoffState, code: string, message: string): Promise<MerchantCommandOutcome> {
  await execute(db, `UPDATE merchant_handoff_commands SET status = 'error', result_snapshot_json = ?, error_code = ?, error_message = ?, completed_at = ? WHERE id = ? AND status = 'pending'`, [
    canonicalJson(state), code, message, new Date().toISOString(), commandId,
  ])
  return { ok: false, replayed: false, command_id: commandId, code, message, merchant: state }
}

export async function executeMerchantHandoffCommand(
  db: DbClient,
  command: MerchantCommand,
): Promise<MerchantCommandOutcome> {
  const requestHash = sha256(command)
  const replay = await storedCommandOutcome(db, command, requestHash)
  if (replay) return replay
  const context = await getMerchantHandoffOrder(db, command.resource.id)
  if (!context) throw new MerchantHandoffError('order_not_found', 404, 'Order not found')
  const { order, destination } = context
  const now = new Date().toISOString()
  try {
    await execute(db, `INSERT INTO merchant_handoff_commands
      (id, organization_id, site_id, location_id, destination_id, order_id, command_version, order_version, expected_state_version, type, idempotency_key, request_hash, provider_mappings_json, command_snapshot_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`, [
      command.id, order.organization_id, order.site_id, order.location_id, order.destination_id, order.id,
      command.resource.version, command.expected_state_version, command.type, command.idempotency_key,
      requestHash, canonicalJson(command.provider_mappings), canonicalJson(command.snapshot), now,
    ])
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))) throw error
    const raced = await storedCommandOutcome(db, command, requestHash)
    if (!raced) throw error
    return raced
  }

  const currentState = stateOf(order)
  if (command.resource.version !== order.order_version) {
    return await storeCommandError(db, command.id, currentState, 'order_version_conflict', `Expected order version ${command.resource.version}, current version is ${order.order_version}`)
  }
  const mappings = parseMerchantProviderMappings(JSON.parse(order.provider_mappings_json))
  if (!sameProviderMappings(command.provider_mappings, mappings)) {
    return await storeCommandError(db, command.id, currentState, 'provider_mapping_conflict', 'Command provider mappings do not match the order')
  }
  const capabilities = parseMerchantHandoffCapabilities(JSON.parse(destination.capabilities_json))
  const requiredCapability = capabilityForCommand(command.type)
  if (!capabilities.includes(requiredCapability)) {
    return await storeCommandError(db, command.id, currentState, 'capability_not_declared', `Destination does not declare ${requiredCapability}`)
  }

  const decision = applyMerchantCommand(currentState, command)
  if (!decision.ok) {
    return await storeCommandError(db, command.id, currentState, decision.code, decision.message)
  }

  const resultJson = canonicalJson(decision.state)
  await executeBatch(db, [
    {
      query: `UPDATE merchant_handoff_orders SET merchant_state = ?, fulfillment_state = ?, state_version = ?, ready_at = ?, last_command_id = ?, updated_at = ? WHERE id = ? AND state_version = ?`,
      params: [decision.state.merchant_state, decision.state.fulfillment_state, decision.state.state_version, decision.state.ready_at, command.id, now, order.id, command.expected_state_version],
    },
    {
      query: `UPDATE merchant_handoff_commands SET status = ?, result_snapshot_json = ?, completed_at = ? WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM merchant_handoff_orders WHERE id = ? AND last_command_id = ? AND state_version = ?)`,
      params: [decision.status, resultJson, now, command.id, order.id, command.id, decision.state.state_version],
    },
  ], { operation: 'apply merchant handoff command' })

  const stored = await queryFirst<CommandRow>(db, `SELECT id, order_id, idempotency_key, request_hash, status, result_snapshot_json, error_code, error_message, created_at FROM merchant_handoff_commands WHERE id = ?`, [command.id])
  const currentOrder = await queryFirst<OrderRow>(db, `SELECT * FROM merchant_handoff_orders WHERE id = ? LIMIT 1`, [order.id])
  if (!stored || !currentOrder) throw new Error(`Merchant command ${command.id} was not stored`)
  if (stored.status === 'pending') {
    const message = `Expected state version ${command.expected_state_version}, current version is ${currentOrder.state_version}`
    await execute(db, `UPDATE merchant_handoff_commands SET status = 'error', result_snapshot_json = ?, error_code = 'state_version_conflict', error_message = ?, completed_at = ? WHERE id = ? AND status = 'pending'`, [
      canonicalJson(stateOf(currentOrder)), message, new Date().toISOString(), command.id,
    ])
    return { ok: false, replayed: false, command_id: command.id, code: 'state_version_conflict', message, merchant: stateOf(currentOrder) }
  }
  return commandOutcome(stored, currentOrder, false)
}

export function merchantHandoffHttpError(error: unknown): { statusCode: number; code: string; message: string } {
  if (error instanceof MerchantHandoffError) {
    return { statusCode: error.statusCode, code: error.code, message: error.message }
  }
  if (error instanceof TypeError) return { statusCode: 400, code: 'invalid_request', message: error.message }
  throw error
}
