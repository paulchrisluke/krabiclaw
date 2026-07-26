import { queryAll, type DbClient } from '~/server/db'
import { getAdapter } from './adapters/registry'
import { listThreadEntries, parseEntryPayload } from './entries'
import { listDeliveryFailures } from './deliveries'
import { getGuestThreadById } from './repository'
import { getMemberCursor } from './read-state'
import { CONVERSATION_STATE_LABELS } from './types'
import type { GuestThreadDetailViewModel, GuestThreadEntryViewModel } from './types'

async function buildActorLabels(db: DbClient, userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await queryAll<{ id: string; name: string }>(db, `
    SELECT id, name FROM user WHERE id IN (${unique.map(() => '?').join(', ')})
  `, unique)
  return new Map((rows ?? []).map(row => [row.id, row.name]))
}

/** Builds the full canonical thread detail view model — the sole source for the detail API. */
export async function getGuestThreadDetail(
  db: DbClient,
  threadId: string,
  siteId: string,
  memberId: string,
): Promise<GuestThreadDetailViewModel | null> {
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return null

  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!source) return null

  const [entryRows, deliveryFailureRows, cursor] = await Promise.all([
    listThreadEntries(db, threadId),
    listDeliveryFailures(db, threadId),
    getMemberCursor(db, threadId, memberId),
  ])

  const actorLabels = await buildActorLabels(db, entryRows.map(e => e.actor_user_id).filter((v): v is string => Boolean(v)))

  const entries: GuestThreadEntryViewModel[] = entryRows.map(entry => ({
    id: entry.id,
    kind: entry.kind,
    actorKind: entry.actor_kind,
    actorUserId: entry.actor_user_id,
    actorLabel: entry.actor_user_id ? (actorLabels.get(entry.actor_user_id) ?? null) : null,
    channel: entry.channel,
    body: entry.body,
    eventName: entry.event_name,
    payload: parseEntryPayload(entry),
    occurredAt: entry.occurred_at,
  }))

  const summary = adapter.summarize(source)

  return {
    id: thread.id,
    guestName: thread.guest_name,
    guestEmail: thread.guest_email,
    guestPhone: thread.guest_phone,
    submissionType: thread.submission_type,
    submissionId: thread.submission_id,
    contextLabel: summary.contextLabel,
    locationLabel: summary.locationTitle,
    conversationState: thread.conversation_state,
    conversationStateLabel: CONVERSATION_STATE_LABELS[thread.conversation_state],
    source: adapter.buildCurrentDetail(source),
    entries,
    availableActions: adapter.listAvailableActions(source),
    deliveryFailures: deliveryFailureRows.map(d => ({
      id: d.id,
      channel: d.channel,
      toAddress: d.to_address,
      lastError: d.last_error,
      attemptCount: d.attempt_count,
      createdAt: d.created_at,
    })),
    memberReadCursor: {
      lastReadEntryId: cursor?.last_read_entry_id ?? null,
      lastReadAt: cursor?.last_read_at ?? null,
    },
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    resolvedAt: thread.resolved_at,
  }
}
