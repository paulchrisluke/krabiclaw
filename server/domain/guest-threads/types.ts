import type { DbClient } from '~/server/db'
import type { MemberAccessPrincipal } from '~/server/utils/member-access'

export interface OrganizationMemberAccessPrincipal {
  memberId: string
  role: string
  organizationId: string
  teamIds: string[] | null
}

export type GuestThreadEntryKind = 'submission' | 'message' | 'operation' | 'assignment' | 'resolution'
export type GuestThreadActorKind = 'guest' | 'member' | 'system'
export type GuestThreadChannel = 'web' | 'email' | 'whatsapp' | 'system'
export type ConversationState = 'needs_attention' | 'waiting_on_guest' | 'resolved'
export type GuestThreadSubmissionType = 'contact' | 'reservation' | 'experience_booking'
export type GuestThreadDeliveryChannel = 'email' | 'whatsapp'
export type GuestThreadDeliveryProvider = 'resend' | 'meta' | 'log_only'
export type GuestThreadDeliveryPurpose = 'owner_alert' | 'guest_acknowledgement' | 'member_reply' | 'status_update'
export type GuestThreadDeliveryStatus = 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown'

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
  conversation_state: ConversationState
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface GuestThreadEntryRow {
  id: string
  thread_id: string
  kind: GuestThreadEntryKind
  actor_kind: GuestThreadActorKind
  actor_user_id: string | null
  channel: GuestThreadChannel | null
  body: string | null
  event_name: string | null
  payload_json: string | null
  dedupe_key: string
  sequence: number
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
  entry_id: string
  channel: GuestThreadDeliveryChannel
  provider: GuestThreadDeliveryProvider
  purpose: GuestThreadDeliveryPurpose
  status: GuestThreadDeliveryStatus
  provider_message_id: string | null
  error: string | null
  created_at: string
  updated_at: string
}

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

export interface GuestThreadSourceAdapter<TSource, TSnapshot, TAction extends string> {
  type: GuestThreadSubmissionType
  loadSource(_ctx: AdapterLoadContext, _submissionId: string): Promise<TSource | null>
  createOpeningSnapshot(_source: TSource): TSnapshot
  summarize(_source: TSource): ThreadSummaryProjection
  getOperationalStatus(_source: TSource): string
  getOperationalStatusLabel(_status: string): string
  listAvailableActions(_source: TSource): TAction[]
  buildCurrentDetail(_source: TSource): ThreadDetailSourceModel
}

export type AnyGuestThreadSourceAdapter = GuestThreadSourceAdapter<unknown, unknown, string>

export interface GuestThreadListItemViewModel {
  id: string
  siteId?: string
  siteSlug?: string | null
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
  purpose: GuestThreadDeliveryPurpose
  error: string | null
  status: 'failed' | 'unknown'
  retryable: boolean
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
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface ListGuestThreadsOptions {
  organizationId?: string | null
  siteId?: string | null
  locationId?: string | null
  principal?: MemberAccessPrincipal | OrganizationMemberAccessPrincipal | null
  userId: string
  search?: string | null
  type?: GuestThreadSubmissionType | null
  conversationState?: ConversationState | null
  unreadOnly?: boolean
  limit?: number
}
