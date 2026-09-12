import type { DbClient } from '~/server/db'
import { getGuestRequest, getThreadOperationalRecord, requestSummary, requestActions } from '~/server/domain/requests'
import { formatOperationalStatusLabel } from './status-labels'
import { listThreadEntries, parseEntryPayload } from './entries'
import { getDeliveryRetryEligibility, listDeliveryFailures } from './deliveries'
import { CONVERSATION_STATE_LABELS } from './types'
import type { GuestThreadDetailViewModel, GuestThreadEntryViewModel } from './types'

/** Builds the full canonical thread detail view model — the sole source for the detail API. */
export async function getGuestThreadDetail(
  db: DbClient,
  threadId: string,
  siteId: string,
): Promise<GuestThreadDetailViewModel | null> {
  const thread = await getGuestRequest(db, threadId, siteId)
  if (!thread) return null


  const [entryRows, deliveryFailureRows] = await Promise.all([
    listThreadEntries(db, threadId),
    listDeliveryFailures(db, threadId),
  ])

  const entries: GuestThreadEntryViewModel[] = entryRows.map(entry => ({
    id: entry.id,
    kind: entry.kind,
    actorKind: entry.actor_kind,
    actorUserId: entry.actor_user_id,
    actorLabel: null,
    channel: entry.channel,
    body: entry.body,
    eventName: entry.event_name,
    payload: parseEntryPayload(entry),
    sequence: entry.sequence,
    occurredAt: entry.occurred_at,
  }))

  const summary = await requestSummary(db, thread)
  const record = await getThreadOperationalRecord(db, thread.id)

  return {
    id: thread.id,
    guestName: summary.guestName,
    guestEmail: summary.guestEmail,
    guestPhone: summary.guestPhone,
    submissionType: thread.kind,
    submissionId: thread.id,
    contextLabel: summary.contextLabel,
    locationLabel: summary.locationTitle,
    conversationState: thread.conversation_state,
    conversationStateLabel: CONVERSATION_STATE_LABELS[thread.conversation_state],
    // The occurrence comes from the booking or reservation, rendered in that
    // record's own timezone. A thread with no record reports no occurrence
    // rather than a fabricated one.
    source: {
      submissionType: thread.kind,
      submissionId: thread.id,
      operationalStatus: record?.status ?? null,
      operationalStatusLabel: record ? formatOperationalStatusLabel(thread.kind, record.status) : null,
      fields: thread.kind === 'contact'
        ? { subject: thread.payload.subject, message: thread.payload.message, locationTitle: summary.locationTitle, productTitle: summary.productTitle }
        : {
            whenLabel: record ? new Intl.DateTimeFormat('en-US', { timeZone: record.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.starts_at)) : null,
            startsAt: record?.starts_at ?? null,
            timezone: record?.timezone ?? null,
            guests: record ? `${record.party_size}${thread.payload.party_size_is_minimum ? '+' : ''}` : null,
            partySize: record?.party_size ?? null,
            notes: thread.payload.notes,
            locationTitle: summary.locationTitle,
            productTitle: summary.productTitle,
          },
    },
    entries,
    availableActions: requestActions(record),
    deliveryFailures: deliveryFailureRows.map(d => ({
      id: d.id,
      channel: d.channel,
      purpose: d.purpose,
      error: d.error,
      status: d.status as 'failed' | 'unknown',
      retryable: getDeliveryRetryEligibility(d) === 'retryable',
      createdAt: d.created_at,
    })),
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    resolvedAt: thread.resolved_at,
  }
}
