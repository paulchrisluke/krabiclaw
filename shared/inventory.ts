export const INVENTORY_MOVEMENT_TYPES = [
  'restock',
  'reserve',
  'release',
  'consume',
  'waste',
  'manual_adjustment',
  'external_sync',
] as const

export type InventoryMovementType = typeof INVENTORY_MOVEMENT_TYPES[number]
export type InventoryAuthorityType = 'krabiclaw' | 'external'
export type InventoryUnavailableReason = 'missing_authority' | 'missing_snapshot' | 'stale' | 'unresolved' | 'out_of_stock'

export interface InventoryAuthority {
  id: string
  organization_id: string
  site_id: string
  location_id: string
  authority_type: InventoryAuthorityType
  provider: string | null
  oauth_client_id: string | null
  provider_account_reference: string | null
  external_location_reference: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface InventorySnapshot {
  id: string
  product_id: string
  authority_id: string
  quantity_on_hand: number
  quantity_reserved: number
  available_quantity: number
  revision: number
  source_version: number | null
  valid_until: string | null
  state: 'current' | 'unresolved'
  updated_at: string
}

export type InventoryAvailability = InventorySnapshot & (
  | { status: 'available'; unavailable_reason: null }
  | { status: 'unavailable'; unavailable_reason: InventoryUnavailableReason }
)

export interface InventoryMovement extends InventorySnapshot {
  movement_id: string
  movement_type: InventoryMovementType
  quantity_on_hand_delta: number
  quantity_reserved_delta: number
  actor_type: 'user' | 'integration' | 'system'
  actor_id: string
  reference_type: string | null
  reference_id: string | null
  idempotency_key: string
  created_at: string
}

export type SetInventoryAuthorityInput =
  | { authority_type: 'krabiclaw' }
  | {
      authority_type: 'external'
      provider: string
      oauth_client_id: string
      provider_account_reference: string
      external_location_reference: string
    }

export interface InventoryReference {
  reference_type: string
  reference_id: string
}

export interface ExternalInventoryEventInput {
  provider_event_id: string
  product_id: string
  resource_version: number
  quantity_on_hand: number
  valid_until: string
  payload: Record<string, unknown>
}

export interface ExternalInventoryEventResult {
  event_id: string
  outcome: 'applied' | 'duplicate' | 'stale' | 'unresolved'
  inventory: InventoryAvailability | null
}
