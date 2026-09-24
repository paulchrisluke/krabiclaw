import { isRecord } from '~/utils/api-clients'
import { resolveBookingPresentation } from '~/utils/booking-presentation'
import { EXPERIENCE_PRESENTATION } from '~/utils/product-presentation'
import type { GuestThreadDeliveryFailure } from '~/components/conversation/GuestThreadConversation.vue'
import type { GuestThreadDetailViewModel } from '~/server/domain/guest-threads/types'

/*
  What the thread list and the conversation both need from the guest-thread API.
  The list and the detail are separate levels of the editor frame and separate
  components, so the response shapes, their runtime validators and the action
  vocabulary live here once rather than in each.
*/

export type SubmissionType = 'contact' | 'reservation' | 'booking'
export type ConversationState = 'needs_attention' | 'waiting_on_guest' | 'resolved'

export interface ThreadListItem {
  id: string
  organizationId?: string
  organizationSlug?: string | null
  guestName: string
  submissionType: SubmissionType
  contextLabel: string
  locationLabel: string | null
  conversationState: ConversationState
  operationalStatus: string | null
  operationalStatusLabel: string | null
  unread: boolean
  unreadCount: number
  preview: { kind: 'message' | 'submission', text: string } | null
  lastActivityAt: string
  needsAttention: boolean
  imageUrl: string | null
  whenLabel: string | null
}

// The detail API's own view model, not a copy of it. Hand-maintained twins of
// this shape are what let the conversation read field names the server had
// stopped sending, so there is one declaration and this reads it.
export type ThreadDetail = GuestThreadDetailViewModel

/*
  What a thread is called, in the tenant's own word.

  There is no fourth list of nouns here. A reservation thread is named by
  `booking-presentation` — Reservation for a restaurant, Consultation for a
  professional-services site — and a booking thread is always a seat on an
  experience, which `product-presentation` already names. A contact thread has
  no record behind it, and reads the way Airbnb's inbox reads one: a direct
  message.
*/
export function threadRecordTitle(type: SubmissionType, vertical: string | null | undefined): string {
  if (type === 'contact') return 'Message'
  if (type === 'booking') return EXPERIENCE_PRESENTATION.itemLabel
  return resolveBookingPresentation('reservation', vertical).label
}

/** The plural, for the filter that narrows the list to this kind. */
export function threadFilterLabel(type: SubmissionType, vertical: string | null | undefined): string {
  if (type === 'contact') return 'Direct messages'
  if (type === 'booking') return EXPERIENCE_PRESENTATION.itemLabelPlural
  return resolveBookingPresentation('reservation', vertical).labelPlural
}

export function isThreadListResponse(value: unknown): value is { threads: ThreadListItem[] } {
  return isRecord(value)
    && Array.isArray(value.threads)
    && value.threads.every(thread =>
      isRecord(thread)
      && typeof thread.id === 'string'
      && typeof thread.guestName === 'string'
      && typeof thread.submissionType === 'string'
      && typeof thread.lastActivityAt === 'string',
    )
}

export function isDeliveryFailure(value: unknown): value is GuestThreadDeliveryFailure {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.channel === 'email' || value.channel === 'whatsapp')
    && (
      value.purpose === 'owner_alert'
      || value.purpose === 'guest_acknowledgement'
      || value.purpose === 'member_reply'
      || value.purpose === 'status_update'
    )
    && (value.error === null || typeof value.error === 'string')
    && (value.status === 'failed' || value.status === 'unknown')
    && typeof value.retryable === 'boolean'
    && typeof value.createdAt === 'string'
}

export function isThreadDetailResponse(value: unknown): value is { thread: ThreadDetail } {
  return isRecord(value)
    && isRecord(value.thread)
    && typeof value.thread.id === 'string'
    && typeof value.thread.guestName === 'string'
    && Array.isArray(value.thread.entries)
    && Array.isArray(value.thread.availableActions)
    && Array.isArray(value.thread.deliveryFailures)
    && value.thread.deliveryFailures.every(isDeliveryFailure)
}
