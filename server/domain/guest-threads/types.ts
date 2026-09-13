import type { GuestRequest } from '~/server/domain/requests'
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
export type GuestThreadSubmissionType = 'contact' | 'reservation' | 'booking'
export type GuestThreadDeliveryChannel = 'email' | 'whatsapp'
export type GuestThreadDeliveryProvider = 'resend' | 'meta' | 'log_only'
export type GuestThreadDeliveryPurpose = 'owner_alert' | 'guest_acknowledgement' | 'member_reply' | 'status_update'
export type GuestThreadDeliveryStatus = 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown'

export const CONVERSATION_STATE_LABELS: Record<ConversationState, string> = {
  needs_attention: 'Needs reply',
  waiting_on_guest: 'Waiting for guest',
  resolved: 'Resolved',
}

export type GuestThreadRow = GuestRequest

export interface GuestThreadEntryRow {
  id: string
  request_id: string
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
  operationalStatus: string | null
}

/**
 * The opening submission's fields, named once here so the detail API and the
 * conversation view cannot drift apart. A `Record<string, unknown>` is what let
 * the view read `date`/`time`/`requests` — names the API never emitted — and
 * silently render a reservation with no date on it.
 *
 * A contact thread carries `subject`/`message`; a reservation or booking
 * carries the occurrence, read from its operational record. A field the thread
 * does not have is null, never a stand-in from somewhere else.
 */
export interface ThreadDetailSourceFields {
  subject?: string | null
  message?: string | null
  whenLabel?: string | null
  startsAt?: string | null
  timezone?: string | null
  guests?: string | null
  partySize?: number | null
  notes?: string | null
  locationTitle?: string | null
  productTitle?: string | null
}

export interface ThreadDetailSourceModel {
  submissionType: GuestThreadSubmissionType
  submissionId: string
  operationalStatus: string | null
  operationalStatusLabel: string | null
  fields: ThreadDetailSourceFields
}


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

/**
 * What became of one outbound send. `channel` here is where the message went,
 * which is not the entry's own channel: a reservation submitted on the web can
 * alert its owner over WhatsApp, and only this says so.
 */
export interface GuestThreadEntryDeliveryViewModel {
  id: string
  channel: GuestThreadDeliveryChannel
  purpose: GuestThreadDeliveryPurpose
  status: GuestThreadDeliveryStatus
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
  deliveries: GuestThreadEntryDeliveryViewModel[]
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
