import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import type { GuestThreadActorKind, GuestThreadChannel, GuestThreadEntryKind, GuestThreadEntryRow } from './types'

export interface AppendEntryInput {
  threadId: string
  kind: GuestThreadEntryKind
  actorKind: GuestThreadActorKind
  actorUserId?: string | null
  channel?: GuestThreadChannel | null
  body?: string | null
  eventName?: string | null
  payloadJson?: Record<string, unknown> | null
  dedupeKey?: string
  occurredAt?: string
  id?: string
}

function isUniqueConstraintError(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
}

function matchingDedupeEntry(
  entry: GuestThreadEntryRow,
  input: AppendEntryInput,
  payloadJson: string | null,
): GuestThreadEntryRow {
  const matches = entry.thread_id === input.threadId
    && entry.kind === input.kind
    && entry.actor_kind === input.actorKind
    && entry.actor_user_id === (input.actorUserId ?? null)
    && entry.channel === (input.channel ?? null)
    && entry.body === (input.body ?? null)
    && entry.event_name === (input.eventName ?? null)
    && entry.payload_json === payloadJson

  if (!matches) {
    throw new Error('Guest thread entry dedupe key belongs to a different ledger fact')
  }
  return entry
}

/**
 * Appends one immutable fact to the canonical guest-thread ledger. Entries are never
 * updated in place — corrections are new entries (issue #442 Locked Decision #2).
 *
 * When `dedupeKey` is provided and already exists, returns the existing entry instead
 * of inserting a duplicate (idempotent inbound ingestion — e.g. inbound email Message-Id,
 * WhatsApp message id). Retries return the original fact so callers can safely resume
 * the remaining idempotent work.
 */
export async function appendEntry(db: DbClient, input: AppendEntryInput): Promise<GuestThreadEntryRow> {
  const payloadJson = input.payloadJson ? JSON.stringify(input.payloadJson) : null
  if (input.dedupeKey) {
    const existing = await findEntryByDedupeKey(db, input.dedupeKey)
    if (existing) return matchingDedupeEntry(existing, input, payloadJson)
  }

  const id = input.id ?? crypto.randomUUID()
  const dedupeKey = input.dedupeKey ?? `entry:${id}`
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const createdAt = new Date().toISOString()

  try {
    const result = await execute(db, `
      INSERT INTO guest_thread_entries
        (id, thread_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, dedupe_key, sequence, occurred_at, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sequence), 0) + 1, ?, ?
      FROM guest_thread_entries
      WHERE thread_id = ?
      ON CONFLICT DO NOTHING
    `, [
      id,
      input.threadId,
      input.kind,
      input.actorKind,
      input.actorUserId ?? null,
      input.channel ?? null,
      input.body ?? null,
      input.eventName ?? null,
      payloadJson,
      dedupeKey,
      occurredAt,
      createdAt,
      input.threadId,
    ])

    if (Number(result?.meta?.changes ?? 0) === 0) {
      const duplicate = await findEntryByDedupeKey(db, dedupeKey)
      if (duplicate) return matchingDedupeEntry(duplicate, input, payloadJson)
      throw new Error('Guest thread entry conflicted with an existing ledger fact')
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrent = await findEntryByDedupeKey(db, dedupeKey)
      if (concurrent) return matchingDedupeEntry(concurrent, input, payloadJson)
    }
    const message = error instanceof Error ? error.message : String(error)
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await queryFirst<GuestThreadEntryRow>(db, `SELECT * FROM guest_thread_entries WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error('Failed to load appended guest thread entry')
  return created
}

export async function findEntryByDedupeKey(db: DbClient, dedupeKey: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries WHERE dedupe_key = ? LIMIT 1
  `, [dedupeKey])
}

export async function getEntryById(db: DbClient, id: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `SELECT * FROM guest_thread_entries WHERE id = ? LIMIT 1`, [id])
}

export async function listThreadEntries(db: DbClient, threadId: string): Promise<GuestThreadEntryRow[]> {
  const rows = await queryAll<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ?
    ORDER BY sequence ASC, occurred_at ASC, id ASC
  `, [threadId])
  return rows ?? []
}

export async function getLatestEntry(db: DbClient, threadId: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ?
    ORDER BY sequence DESC, occurred_at DESC, id DESC
    LIMIT 1
  `, [threadId])
}

export async function getLatestEntryByKind(
  db: DbClient,
  threadId: string,
  kinds: GuestThreadEntryKind[],
): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ? AND kind IN (SELECT value FROM json_each(?))
    ORDER BY sequence DESC, occurred_at DESC, id DESC
    LIMIT 1
  `, [threadId, d1JsonStringSet(kinds)])
}

export function parseEntryPayload(entry: GuestThreadEntryRow): Record<string, unknown> | null {
  if (!entry.payload_json) return null
  try {
    return JSON.parse(entry.payload_json) as Record<string, unknown>
  } catch {
    return null
  }
}
