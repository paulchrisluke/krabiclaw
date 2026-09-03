import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import type {
  ExternalInventoryEventInput,
  ExternalInventoryEventResult,
  InventoryAuthority,
  InventoryAvailability,
  InventoryMovement,
  InventoryMovementType,
  InventoryReference,
  InventorySnapshot,
  SetInventoryAuthorityInput,
} from '~/shared/inventory'

const MAX_IDENTIFIER_LENGTH = 256
const MAX_PROVIDER_PAYLOAD_BYTES = 64 * 1024

interface InventoryRow {
  id: string
  product_id: string
  authority_id: string
  authority_type: 'krabiclaw' | 'external'
  quantity_on_hand: number
  quantity_reserved: number
  revision: number
  source_version: number | null
  valid_until: string | null
  state: 'current' | 'unresolved'
  updated_at: string
}

interface MovementRow extends InventoryRow {
  movement_id: string
  movement_type: InventoryMovementType
  quantity_on_hand_delta: number
  quantity_reserved_delta: number
  resulting_quantity_on_hand: number
  resulting_quantity_reserved: number
  resulting_revision: number
  actor_type: 'user' | 'integration' | 'system'
  actor_id: string
  reference_type: string | null
  reference_id: string | null
  idempotency_key: string
  created_at: string
}

function isSameMovementCommand(
  row: MovementRow,
  command: {
    productId: string
    movementType: LocalMovementType
    onHandDelta: number
    reservedDelta: number
    referenceType: string | null
    referenceId: string | null
  },
): boolean {
  return row.product_id === command.productId
    && row.movement_type === command.movementType
    && Number(row.quantity_on_hand_delta) === command.onHandDelta
    && Number(row.quantity_reserved_delta) === command.reservedDelta
    && row.reference_type === command.referenceType
    && row.reference_id === command.referenceId
}

function requiredIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_IDENTIFIER_LENGTH) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be 1-${MAX_IDENTIFIER_LENGTH} characters` })
  }
  return value.trim()
}

function mapInventory(row: InventoryRow, now = Date.now()): InventoryAvailability {
  const quantityOnHand = Number(row.quantity_on_hand)
  const quantityReserved = Number(row.quantity_reserved)
  const snapshot: InventorySnapshot = {
    id: row.id,
    product_id: row.product_id,
    authority_id: row.authority_id,
    quantity_on_hand: quantityOnHand,
    quantity_reserved: quantityReserved,
    available_quantity: quantityOnHand - quantityReserved,
    revision: Number(row.revision),
    source_version: row.source_version === null ? null : Number(row.source_version),
    valid_until: row.valid_until,
    state: row.state,
    updated_at: row.updated_at,
  }
  if (row.state !== 'current') return { ...snapshot, status: 'unavailable', unavailable_reason: 'unresolved' }
  if (row.authority_type === 'external' && (!row.valid_until || Date.parse(row.valid_until) <= now)) {
    return { ...snapshot, status: 'unavailable', unavailable_reason: 'stale' }
  }
  if (snapshot.available_quantity <= 0) return { ...snapshot, status: 'unavailable', unavailable_reason: 'out_of_stock' }
  return { ...snapshot, status: 'available', unavailable_reason: null }
}

function mapMovement(row: MovementRow): InventoryMovement {
  return {
    ...mapInventory({
      ...row,
      quantity_on_hand: row.resulting_quantity_on_hand,
      quantity_reserved: row.resulting_quantity_reserved,
      revision: row.resulting_revision,
      updated_at: row.created_at,
    }),
    movement_id: row.movement_id,
    movement_type: row.movement_type,
    quantity_on_hand_delta: Number(row.quantity_on_hand_delta),
    quantity_reserved_delta: Number(row.quantity_reserved_delta),
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
  }
}

async function assertLocation(db: DbClient, organizationId: string, siteId: string, locationId: string) {
  const row = await queryFirst(db, `SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?`, [locationId, organizationId, siteId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
}

async function assertProduct(db: DbClient, organizationId: string, siteId: string, locationId: string, productId: string) {
  const row = await queryFirst(db, `SELECT id FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, [productId, organizationId, siteId, locationId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found' })
}

export async function getInventoryAuthority(db: DbClient, organizationId: string, siteId: string, locationId: string): Promise<InventoryAuthority | null> {
  return await queryFirst<InventoryAuthority>(db, `
    SELECT id, organization_id, site_id, location_id, authority_type, provider, oauth_client_id,
           provider_account_reference, external_location_reference, created_by, updated_by, created_at, updated_at
      FROM inventory_authorities
     WHERE organization_id = ? AND site_id = ? AND location_id = ?
  `, [organizationId, siteId, locationId])
}

export async function setInventoryAuthority(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: SetInventoryAuthorityInput,
  actorId: string,
): Promise<InventoryAuthority> {
  if (!input || (input.authority_type !== 'krabiclaw' && input.authority_type !== 'external')) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'authority_type must be krabiclaw or external' })
  }
  await assertLocation(db, organizationId, siteId, locationId)
  const existing = await getInventoryAuthority(db, organizationId, siteId, locationId)
  const external = input.authority_type === 'external'
    ? {
        provider: requiredIdentifier(input.provider, 'provider'),
        oauthClientId: requiredIdentifier(input.oauth_client_id, 'oauth_client_id'),
        account: requiredIdentifier(input.provider_account_reference, 'provider_account_reference'),
        location: requiredIdentifier(input.external_location_reference, 'external_location_reference'),
      }
    : null
  if (existing) {
    const unchanged = existing.authority_type === input.authority_type
      && existing.provider === (external?.provider ?? null)
      && existing.oauth_client_id === (external?.oauthClientId ?? null)
      && existing.provider_account_reference === (external?.account ?? null)
      && existing.external_location_reference === (external?.location ?? null)
    if (!unchanged) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Inventory authority is already declared for this location' })
    }
    return existing
  }
  const authorityId = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO inventory_authorities (
      id, organization_id, site_id, location_id, authority_type, provider, oauth_client_id,
      provider_account_reference, external_location_reference, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [authorityId, organizationId, siteId, locationId, input.authority_type, external?.provider ?? null,
      external?.oauthClientId ?? null, external?.account ?? null, external?.location ?? null, actorId, actorId, now, now],
  }], { operation: 'declare inventory authority' })
  return (await getInventoryAuthority(db, organizationId, siteId, locationId))!
}

export async function listLocationInventory(db: DbClient, organizationId: string, siteId: string, locationId: string): Promise<{ authority: InventoryAuthority | null; items: InventoryAvailability[] }> {
  await assertLocation(db, organizationId, siteId, locationId)
  const [authority, rows] = await Promise.all([
    getInventoryAuthority(db, organizationId, siteId, locationId),
    queryAll<InventoryRow>(db, `
      SELECT ii.id, ii.product_id, ii.authority_id, ia.authority_type, ii.quantity_on_hand, ii.quantity_reserved,
             ii.revision, ii.source_version, ii.valid_until, ii.state, ii.updated_at
        FROM inventory_items ii
        JOIN inventory_authorities ia ON ia.id = ii.authority_id
       WHERE ii.organization_id = ? AND ii.site_id = ? AND ii.location_id = ?
       ORDER BY ii.product_id
    `, [organizationId, siteId, locationId]),
  ])
  return { authority, items: rows.map(row => mapInventory(row)) }
}

export async function hydrateProductInventory(db: DbClient, products: Array<{ id: string }>): Promise<Map<string, InventoryAvailability>> {
  if (products.length === 0) return new Map()
  const rows = await queryAll<InventoryRow>(db, `
    SELECT ii.id, ii.product_id, ii.authority_id, ia.authority_type, ii.quantity_on_hand, ii.quantity_reserved,
           ii.revision, ii.source_version, ii.valid_until, ii.state, ii.updated_at
      FROM inventory_items ii
      JOIN inventory_authorities ia ON ia.id = ii.authority_id
     WHERE ii.product_id IN (SELECT value FROM json_each(?))
  `, [JSON.stringify(products.map(product => product.id))])
  return new Map(rows.map(row => [row.product_id, mapInventory(row)]))
}

type LocalMovementType = Exclude<InventoryMovementType, 'external_sync'>

export async function applyInventoryMovement(
  db: DbClient,
  scope: { organizationId: string; siteId: string; locationId: string; productId: string },
  input: { movement_type: LocalMovementType; quantity: number; idempotency_key: string; reference?: InventoryReference },
  actor: { type: 'user' | 'system'; id: string },
): Promise<InventoryMovement> {
  if (!input || typeof input !== 'object') throw new HTTPError({ statusCode: 400, statusMessage: 'Inventory movement is required' })
  const { organizationId, siteId, locationId, productId } = scope
  await assertProduct(db, organizationId, siteId, locationId, productId)
  const idempotencyKey = requiredIdentifier(input.idempotency_key, 'idempotency_key')
  if (!['restock', 'reserve', 'release', 'consume', 'waste', 'manual_adjustment'].includes(input.movement_type)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Unsupported inventory movement' })
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity === 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'quantity must be a non-zero safe integer' })
  }
  if (input.movement_type !== 'manual_adjustment' && input.quantity < 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'quantity must be positive' })
  }
  if (['reserve', 'release', 'consume'].includes(input.movement_type) && !input.reference) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${input.movement_type} requires a reference` })
  }
  const referenceType = input.reference ? requiredIdentifier(input.reference.reference_type, 'reference_type') : null
  const referenceId = input.reference ? requiredIdentifier(input.reference.reference_id, 'reference_id') : null
  const onHandDelta = input.movement_type === 'restock' || input.movement_type === 'manual_adjustment'
    ? input.quantity
    : input.movement_type === 'waste' || input.movement_type === 'consume' ? -input.quantity : 0
  const reservedDelta = input.movement_type === 'reserve' ? input.quantity : input.movement_type === 'release' || input.movement_type === 'consume' ? -input.quantity : 0
  const command = { productId, movementType: input.movement_type, onHandDelta, reservedDelta, referenceType, referenceId }
  const existing = await loadMovementByIdempotency(db, organizationId, siteId, locationId, idempotencyKey)
  if (existing) {
    if (!isSameMovementCommand(existing, command)) throw new HTTPError({ statusCode: 409, statusMessage: 'Idempotency key was already used for a different inventory command' })
    return mapMovement(existing)
  }
  const authority = await getInventoryAuthority(db, organizationId, siteId, locationId)
  if (!authority) throw new HTTPError({ statusCode: 409, statusMessage: 'Inventory authority is not configured' })
  if (['restock', 'waste', 'manual_adjustment'].includes(input.movement_type) && authority.authority_type !== 'krabiclaw') {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Inventory is externally authoritative' })
  }
  if (authority.authority_type === 'krabiclaw') {
    await executeBatch(db, [{
      query: `INSERT OR IGNORE INTO inventory_items (
        id, organization_id, site_id, location_id, product_id, authority_id, quantity_on_hand,
        quantity_reserved, revision, source_version, valid_until, state, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 'current', ?)`,
      params: [crypto.randomUUID(), organizationId, siteId, locationId, productId, authority.id, new Date().toISOString()],
    }], { operation: 'initialize KrabiClaw inventory item' })
  }
  const item = await loadInventoryItem(db, organizationId, siteId, locationId, productId)
  if (!item) throw new HTTPError({ statusCode: 409, statusMessage: 'Inventory snapshot is missing' })
  const resultingOnHand = Number(item.quantity_on_hand) + onHandDelta
  const resultingReserved = Number(item.quantity_reserved) + reservedDelta
  if (!Number.isSafeInteger(resultingOnHand) || !Number.isSafeInteger(resultingReserved)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Resulting inventory quantity exceeds the supported integer range' })
  }
  if (resultingOnHand < 0 || resultingReserved < 0 || resultingReserved > resultingOnHand) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Insufficient current inventory' })
  }
  const movementId = crypto.randomUUID()
  const now = new Date().toISOString()
  const baseRevision = Number(item.revision)
  await executeBatch(db, [
    {
      query: `INSERT OR IGNORE INTO inventory_movements (
        id, organization_id, site_id, location_id, product_id, inventory_item_id, authority_id,
        movement_type, quantity_on_hand_delta, quantity_reserved_delta, resulting_quantity_on_hand,
        resulting_quantity_reserved, base_revision, resulting_revision, actor_type, actor_id,
        reference_type, reference_id, idempotency_key, created_at
      ) SELECT ?, ?, ?, ?, ?, ii.id, ii.authority_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM inventory_items ii JOIN inventory_authorities ia ON ia.id = ii.authority_id
         WHERE ii.organization_id = ? AND ii.site_id = ? AND ii.location_id = ? AND ii.product_id = ?
           AND ii.revision = ? AND ii.state = 'current'
           AND (ia.authority_type = 'krabiclaw' OR (ii.valid_until IS NOT NULL AND ii.valid_until > ?))`,
      params: [movementId, organizationId, siteId, locationId, productId, input.movement_type, onHandDelta, reservedDelta,
        resultingOnHand, resultingReserved, baseRevision, baseRevision + 1, actor.type, actor.id, referenceType, referenceId,
        idempotencyKey, now, organizationId, siteId, locationId, productId, baseRevision, now],
    },
    {
      query: `UPDATE inventory_items
                 SET quantity_on_hand = ?, quantity_reserved = ?, revision = ?, updated_at = ?
               WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_id = ? AND revision = ?
                 AND EXISTS (SELECT 1 FROM inventory_movements im WHERE im.id = ? AND im.base_revision = inventory_items.revision)`,
      params: [resultingOnHand, resultingReserved, baseRevision + 1, now, organizationId, siteId, locationId, productId, baseRevision, movementId],
    },
  ], { operation: `${input.movement_type} inventory` })
  const movement = await loadMovementByIdempotency(db, organizationId, siteId, locationId, idempotencyKey)
  if (!movement) throw new HTTPError({ statusCode: 409, statusMessage: 'Inventory changed; retry with a new idempotency key' })
  if (!isSameMovementCommand(movement, command)) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Idempotency key was already used for a different inventory command' })
  }
  return mapMovement(movement)
}

export const reserveInventory = (db: DbClient, scope: Parameters<typeof applyInventoryMovement>[1], quantity: number, idempotencyKey: string, reference: InventoryReference, actorId: string) =>
  applyInventoryMovement(db, scope, { movement_type: 'reserve', quantity, idempotency_key: idempotencyKey, reference }, { type: 'system', id: actorId })
export const releaseInventory = (db: DbClient, scope: Parameters<typeof applyInventoryMovement>[1], quantity: number, idempotencyKey: string, reference: InventoryReference, actorId: string) =>
  applyInventoryMovement(db, scope, { movement_type: 'release', quantity, idempotency_key: idempotencyKey, reference }, { type: 'system', id: actorId })
export const consumeInventory = (db: DbClient, scope: Parameters<typeof applyInventoryMovement>[1], quantity: number, idempotencyKey: string, reference: InventoryReference, actorId: string) =>
  applyInventoryMovement(db, scope, { movement_type: 'consume', quantity, idempotency_key: idempotencyKey, reference }, { type: 'system', id: actorId })

export async function ingestExternalInventoryEvent(
  db: DbClient,
  scope: { organizationId: string; siteId: string; locationId: string },
  input: ExternalInventoryEventInput,
  actor: { userId: string; oauthClientId: string },
): Promise<ExternalInventoryEventResult> {
  if (!input || typeof input !== 'object') throw new HTTPError({ statusCode: 400, statusMessage: 'Inventory event is required' })
  const { organizationId, siteId, locationId } = scope
  const authority = await getInventoryAuthority(db, organizationId, siteId, locationId)
  if (!authority || authority.authority_type !== 'external') throw new HTTPError({ statusCode: 409, statusMessage: 'External inventory authority is not configured' })
  if (authority.oauth_client_id !== actor.oauthClientId) throw new HTTPError({ statusCode: 404, statusMessage: 'Inventory authority not found or access denied' })
  const providerEventId = requiredIdentifier(input.provider_event_id, 'provider_event_id')
  const productId = requiredIdentifier(input.product_id, 'product_id')
  if (!Number.isSafeInteger(input.resource_version) || input.resource_version < 0) throw new HTTPError({ statusCode: 400, statusMessage: 'resource_version must be a non-negative safe integer' })
  if (!Number.isSafeInteger(input.quantity_on_hand) || input.quantity_on_hand < 0) throw new HTTPError({ statusCode: 400, statusMessage: 'quantity_on_hand must be a non-negative safe integer' })
  const validUntilMs = typeof input.valid_until === 'string' ? Date.parse(input.valid_until) : Number.NaN
  if (Number.isNaN(validUntilMs)) throw new HTTPError({ statusCode: 400, statusMessage: 'valid_until must be an ISO instant' })
  const validUntil = new Date(validUntilMs).toISOString()
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw new HTTPError({ statusCode: 400, statusMessage: 'payload must be an object' })
  const payloadJson = JSON.stringify(input.payload)
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_PROVIDER_PAYLOAD_BYTES) throw new HTTPError({ statusCode: 413, statusMessage: 'payload is too large' })
  const existing = await queryFirst<{ id: string }>(db, `SELECT id FROM inventory_external_events WHERE authority_id = ? AND provider_event_id = ?`, [authority.id, providerEventId])
  if (existing) {
    return { event_id: existing.id, outcome: 'duplicate', inventory: await loadInventoryAvailability(db, organizationId, siteId, locationId, productId) }
  }
  const product = await queryFirst<{ id: string }>(db, `SELECT id FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, [productId, organizationId, siteId, locationId])
  const eventId = crypto.randomUUID()
  const now = new Date().toISOString()
  const movementId = `movement:${eventId}`
  await executeBatch(db, [
    {
      query: `INSERT OR IGNORE INTO inventory_external_events (
        id, organization_id, site_id, location_id, authority_id, provider_event_id, requested_product_id,
        product_id, resource_version, quantity_on_hand, valid_until, oauth_client_id, actor_user_id, payload_json, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [eventId, organizationId, siteId, locationId, authority.id, providerEventId, productId, product?.id ?? null,
        input.resource_version, input.quantity_on_hand, validUntil, actor.oauthClientId, actor.userId, payloadJson, now],
    },
    {
      query: `INSERT OR IGNORE INTO inventory_items (
        id, organization_id, site_id, location_id, product_id, authority_id, quantity_on_hand, quantity_reserved,
        revision, source_version, valid_until, state, last_external_event_id, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 'unresolved', NULL, ?
         WHERE ? IS NOT NULL
           AND EXISTS (SELECT 1 FROM inventory_external_events WHERE id = ?)`,
      params: [crypto.randomUUID(), organizationId, siteId, locationId, productId, authority.id, now, product?.id ?? null, eventId],
    },
    {
      query: `INSERT OR IGNORE INTO inventory_movements (
        id, organization_id, site_id, location_id, product_id, inventory_item_id, authority_id, movement_type,
        quantity_on_hand_delta, quantity_reserved_delta, resulting_quantity_on_hand, resulting_quantity_reserved,
        base_revision, resulting_revision, actor_type, actor_id, reference_type, reference_id, idempotency_key, created_at
      ) SELECT ?, ?, ?, ?, ?, ii.id, ii.authority_id, 'external_sync',
               CASE WHEN ? >= ii.quantity_reserved THEN ? - ii.quantity_on_hand ELSE 0 END,
               0,
               CASE WHEN ? >= ii.quantity_reserved THEN ? ELSE ii.quantity_on_hand END,
               ii.quantity_reserved, ii.revision, ii.revision + 1,
               'integration', ?, 'provider_event', ?, ?, ?
          FROM inventory_items ii
         WHERE ii.organization_id = ? AND ii.site_id = ? AND ii.location_id = ? AND ii.product_id = ?
           AND ii.authority_id = ? AND (ii.source_version IS NULL OR ii.source_version < ?)
           AND EXISTS (SELECT 1 FROM inventory_external_events WHERE id = ?)`,
      params: [movementId, organizationId, siteId, locationId, productId,
        input.quantity_on_hand, input.quantity_on_hand, input.quantity_on_hand, input.quantity_on_hand,
        actor.oauthClientId, providerEventId, `external:${providerEventId}`, now,
        organizationId, siteId, locationId, productId, authority.id, input.resource_version, eventId],
    },
    {
      query: `UPDATE inventory_items
                 SET quantity_on_hand = (SELECT resulting_quantity_on_hand FROM inventory_movements WHERE id = ?),
                     quantity_reserved = (SELECT resulting_quantity_reserved FROM inventory_movements WHERE id = ?),
                     source_version = ?, valid_until = ?,
                     state = CASE WHEN ? >= quantity_reserved THEN 'current' ELSE 'unresolved' END,
                     last_external_event_id = ?,
                     revision = (SELECT resulting_revision FROM inventory_movements WHERE id = ?), updated_at = ?
               WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_id = ?
                 AND authority_id = ?
                 AND EXISTS (
                   SELECT 1 FROM inventory_movements im
                    WHERE im.id = ? AND im.inventory_item_id = inventory_items.id
                      AND im.base_revision = inventory_items.revision
                 )`,
      params: [movementId, movementId, input.resource_version, validUntil, input.quantity_on_hand, eventId, movementId, now,
        organizationId, siteId, locationId, productId, authority.id, movementId],
    },
  ], { operation: 'ingest external inventory event' })
  const stored = await queryFirst<{ id: string }>(db, `SELECT id FROM inventory_external_events WHERE authority_id = ? AND provider_event_id = ?`, [authority.id, providerEventId])
  const inventory = product ? await loadInventoryAvailability(db, organizationId, siteId, locationId, productId) : null
  if (!stored) throw new HTTPError({ statusCode: 409, statusMessage: 'External inventory event was not accepted' })
  if (stored.id !== eventId) return { event_id: stored.id, outcome: 'duplicate', inventory }
  const applied = await queryFirst(db, `SELECT 1 FROM inventory_items WHERE product_id = ? AND last_external_event_id = ?`, [productId, eventId])
  if (!product) return { event_id: eventId, outcome: 'unresolved', inventory }
  if (!applied) return { event_id: eventId, outcome: 'stale', inventory }
  return { event_id: eventId, outcome: inventory?.state === 'unresolved' ? 'unresolved' : 'applied', inventory }
}

async function loadInventoryItem(db: DbClient, organizationId: string, siteId: string, locationId: string, productId: string): Promise<InventoryRow | null> {
  return await queryFirst<InventoryRow>(db, `
    SELECT ii.id, ii.product_id, ii.authority_id, ia.authority_type, ii.quantity_on_hand, ii.quantity_reserved,
           ii.revision, ii.source_version, ii.valid_until, ii.state, ii.updated_at
      FROM inventory_items ii JOIN inventory_authorities ia ON ia.id = ii.authority_id
     WHERE ii.organization_id = ? AND ii.site_id = ? AND ii.location_id = ? AND ii.product_id = ?
  `, [organizationId, siteId, locationId, productId])
}

async function loadInventoryAvailability(db: DbClient, organizationId: string, siteId: string, locationId: string, productId: string) {
  const row = await loadInventoryItem(db, organizationId, siteId, locationId, productId)
  return row ? mapInventory(row) : null
}

async function loadMovementByIdempotency(db: DbClient, organizationId: string, siteId: string, locationId: string, idempotencyKey: string): Promise<MovementRow | null> {
  return await queryFirst<MovementRow>(db, `
    SELECT ii.id, ii.product_id, ii.authority_id, ia.authority_type, ii.quantity_on_hand, ii.quantity_reserved,
           ii.revision, ii.source_version, ii.valid_until, ii.state, ii.updated_at,
           im.id AS movement_id, im.movement_type, im.quantity_on_hand_delta, im.quantity_reserved_delta,
           im.resulting_quantity_on_hand, im.resulting_quantity_reserved, im.resulting_revision,
           im.actor_type, im.actor_id, im.reference_type, im.reference_id, im.idempotency_key, im.created_at
      FROM inventory_movements im
      JOIN inventory_items ii ON ii.id = im.inventory_item_id
      JOIN inventory_authorities ia ON ia.id = ii.authority_id
     WHERE im.organization_id = ? AND im.site_id = ? AND im.location_id = ? AND im.idempotency_key = ?
  `, [organizationId, siteId, locationId, idempotencyKey])
}
