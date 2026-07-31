import type { DbClient } from '~/server/db'
import type { MemberAccessPrincipal } from '~/server/utils/member-access'

export type GuestThreadEntryKind = 'submission' | 'message' | 'operation' | 'delivery' | 'assignment' | 'resolution'
export type GuestThreadActorKind = 'guest' | 'member' | 'system'
export type GuestThreadChannel = 'web' | 'email' | 'whatsapp' | 'system'
export type ConversationState = 'needs_attention' | 'waiting_on_guest' | 'resolved'
export type GuestThreadSubmissionType = 'contact' | 'reservation' | 'experience_booking'
export type GuestThreadDeliveryChannel = 'email' | 'whatsapp'
export type GuestThreadDeliveryStatus = 'queued' | 'sent' | 'failed'
export type GuestThreadCommandStatus = 'pending' | 'completed' | 'failed'
export type GuestThreadOutboxStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'dead'

export const CONVERSATION_STATE_LABELS: Record<ConversationState, string> = {
  needs_attention: 'Needs reply',
  waiting_on_guest: 'Waiting for guest',
  resolved: 'Resolved',
}

export interface GuestThreadRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  submission_type: GuestThreadSubmissionType
  submission_id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  last_message_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  last_message_preview: string | null
  conversation_state: ConversationState
  operational_status: string | null
  version: number
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface GuestThreadEntryRow {
  id: string
  thread_id: string
  organization_id: string
  site_id: string
  kind: GuestThreadEntryKind
  actor_kind: GuestThreadActorKind
  actor_user_id: string | null
  channel: GuestThreadChannel | null
  body: string | null
  event_name: string | null
  payload_json: string | null
  external_id: string | null
  sequence: number | null
  occurred_at: string
  created_at: string
}

export interface GuestThreadMemberStateRow {
  thread_id: string
  member_id: string
  last_read_entry_id: string | null
  last_read_sequence: number
  created_at: string
  updated_at: string
}

export interface GuestThreadDeliveryRow {
  id: string
  thread_id: string
  entry_id: string | null
  channel: GuestThreadDeliveryChannel
  provider: string | null
  idempotency_key: string
  status: GuestThreadDeliveryStatus
  attempt_count: number
  last_error: string | null
  provider_message_id: string | null
  to_address: string | null
  from_name: string | null
  subject: string | null
  text_body: string | null
  reply_to: string | null
  locale: string | null
  template_version: string | null
  source_snapshot_json: string | null
  payload_hash: string | null
  provider_idempotency_key: string | null
  processing_lease_until: string | null
  created_at: string
  updated_at: string
}

export interface GuestThreadCommandRow {
  id: string
  thread_id: string
  organization_id: string
  site_id: string
  action: string
  idempotency_key: string
  actor_kind: GuestThreadActorKind
  actor_user_id: string | null
  actor_member_id: string | null
  request_hash: string
  status: GuestThreadCommandStatus
  result_json: string | null
  created_at: string
  completed_at: string | null
}

export interface GuestThreadOutboxRow {
  id: string
  thread_id: string
  delivery_id: string | null
  event_type: string
  status: GuestThreadOutboxStatus
  attempt_count: number
  next_attempt_at: string | null
  locked_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

// ---- Source adapter contract ---------------------------------------------------------

export interface AdapterLoadContext {
  db: DbClient
}

export interface ThreadSummaryProjection {
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  organizationId: string
  siteId: string
  locationId: string | null
  locationTitle: string | null
  contextLabel: string
  createdAt: string
  operationalStatus: string
}

export interface ThreadDetailSourceModel {
  submissionType: GuestThreadSubmissionType
  submissionId: string
  operationalStatus: string
  operationalStatusLabel: string
  fields: Record<string, unknown>
}

export interface OperationExecutionContext {
  db: DbClient
  actorUserId: string
  actorMemberId: string
}

export type OperationExecutionResult =
  | {
      ok: true
      beforeStatus: string
      afterStatus: string
      /** Whether a successful completion of this action requires a guest notification. */
      requiresNotification: boolean
      notifyChannel: GuestThreadDeliveryChannel | null
    }
  | { ok: false; reason: 'invalid_transition' | 'not_found'; message: string }

export interface GuestThreadSourceAdapter<TSource, TSnapshot, TAction extends string> {
  type: GuestThreadSubmissionType
  loadSource(_ctx: AdapterLoadContext, _submissionId: string): Promise<TSource | null>
  createOpeningSnapshot(_source: TSource): TSnapshot
  summarize(_source: TSource): ThreadSummaryProjection
  getOperationalStatus(_source: TSource): string
  getOperationalStatusLabel(_status: string): string
  listAvailableActions(_source: TSource): TAction[]
  executeAction(_ctx: OperationExecutionContext, _source: TSource, _action: TAction): Promise<OperationExecutionResult>
  buildCurrentDetail(_source: TSource): ThreadDetailSourceModel
}

// Type-erased form used by the registry/operations layer so callers don't need to know
// each adapter's concrete TSource/TSnapshot/TAction generics.
export type AnyGuestThreadSourceAdapter = GuestThreadSourceAdapter<unknown, unknown, string>

// ---- View models -----------------------------------------------------------------------

export interface GuestThreadListItemViewModel {
  id: string
  guestName: string
  submissionType: GuestThreadSubmissionType
  contextLabel: string
  locationLabel: string | null
  conversationState: ConversationState
  conversationStateLabel: string
  operationalStatus: string | null
  operationalStatusLabel: string | null
  unread: boolean
  unreadCount: number
  preview: { kind: 'message' | 'submission'; text: string } | null
  lastActivityAt: string
  needsAttention: boolean
}

export interface GuestThreadEntryViewModel {
  id: string
  kind: GuestThreadEntryKind
  actorKind: GuestThreadActorKind
  actorUserId: string | null
  actorLabel: string | null
  channel: GuestThreadChannel | null
  body: string | null
  eventName: string | null
  payload: Record<string, unknown> | null
  sequence: number | null
  occurredAt: string
}

export interface GuestThreadDeliveryFailureViewModel {
  id: string
  channel: GuestThreadDeliveryChannel
  toAddress: string | null
  lastError: string | null
  attemptCount: number
  createdAt: string
}

export interface GuestThreadDetailViewModel {
  id: string
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  submissionType: GuestThreadSubmissionType
  submissionId: string
  contextLabel: string
  locationLabel: string | null
  conversationState: ConversationState
  conversationStateLabel: string
  source: ThreadDetailSourceModel
  entries: GuestThreadEntryViewModel[]
  availableActions: string[]
  deliveryFailures: GuestThreadDeliveryFailureViewModel[]
  memberReadCursor: { lastReadEntryId: string | null; lastReadSequence: number }
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface ListGuestThreadsOptions {
  locationId?: string | null
  principal?: MemberAccessPrincipal | null
  memberId: string
  search?: string | null
  type?: GuestThreadSubmissionType | null
  conversationState?: ConversationState | null
  unreadOnly?: boolean
  limit?: number
}
