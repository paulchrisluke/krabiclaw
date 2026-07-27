import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import type { GuestThreadActorKind, GuestThreadChannel, GuestThreadEntryKind, GuestThreadEntryRow } from './types'

export interface AppendEntryInput {
  threadId: string
  organizationId: string
  siteId: string
  kind: GuestThreadEntryKind
  actorKind: GuestThreadActorKind
  actorUserId?: string | null
  channel?: GuestThreadChannel | null
  body?: string | null
  eventName?: string | null
  payloadJson?: Record<string, unknown> | null
  externalId?: string | null
  occurredAt?: string
  id?: string
}

function isUniqueConstraintError(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
}

async function reserveThreadSequence(db: DbClient, threadId: string): Promise<number> {
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO guest_thread_sequence_counters (thread_id, next_sequence, updated_at)
    VALUES (?, COALESCE((SELECT MAX(sequence) + 1 FROM guest_thread_entries WHERE thread_id = ?), 1), ?)
    ON CONFLICT(thread_id) DO NOTHING
  `, [threadId, threadId, now])

  const reserved = await queryFirst<{ sequence: number }>(db, `
    UPDATE guest_thread_sequence_counters
    SET next_sequence = next_sequence + 1, updated_at = ?
    WHERE thread_id = ?
    RETURNING next_sequence - 1 AS sequence
  `, [now, threadId])
  if (!reserved) throw new Error('Failed to reserve guest thread entry sequence')
  return reserved.sequence
}

/**
 * Appends one immutable fact to the canonical guest-thread ledger. Entries are never
 * updated in place — corrections are new entries (issue #442 Locked Decision #2).
 *
 * When `externalId` is provided and already exists, returns the existing entry instead
 * of inserting a duplicate (idempotent inbound ingestion — e.g. inbound email Message-Id,
 * WhatsApp message id). The returned row includes `created` so callers can distinguish
 * a new append from a retry.
 */
export async function appendEntry(db: DbClient, input: AppendEntryInput): Promise<GuestThreadEntryRow & { created?: boolean }> {
  if (input.externalId) {
    const existing = await findEntryByExternalId(db, input.externalId)
    if (existing) return { ...existing, created: false }
  }

  const id = input.id ?? crypto.randomUUID()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const createdAt = new Date().toISOString()
  const payloadJson = input.payloadJson ? JSON.stringify(input.payloadJson) : null

  const sequence = await reserveThreadSequence(db, input.threadId)
  try {
    await execute(db, `
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, external_id, sequence, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.threadId,
      input.organizationId,
      input.siteId,
      input.kind,
      input.actorKind,
      input.actorUserId ?? null,
      input.channel ?? null,
      input.body ?? null,
      input.eventName ?? null,
      payloadJson,
      input.externalId ?? null,
      sequence,
      occurredAt,
      createdAt,
    ])
  } catch (error) {
    if (input.externalId && isUniqueConstraintError(error)) {
      const concurrent = await findEntryByExternalId(db, input.externalId)
      if (concurrent) return concurrent
    }
    const message = error instanceof Error ? error.message : String(error)
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await queryFirst<GuestThreadEntryRow>(db, `SELECT * FROM guest_thread_entries WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error('Failed to load appended guest thread entry')
  return { ...created, created: true }
}

export async function findEntryByExternalId(db: DbClient, externalId: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries WHERE external_id = ? LIMIT 1
  `, [externalId])
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
  const placeholders = kinds.map(() => '?').join(', ')
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ? AND kind IN (${placeholders})
    ORDER BY sequence DESC, occurred_at DESC, id DESC
    LIMIT 1
  `, [threadId, ...kinds])
}

export function parseEntryPayload(entry: GuestThreadEntryRow): Record<string, unknown> | null {
  if (!entry.payload_json) return null
  try {
    return JSON.parse(entry.payload_json) as Record<string, unknown>
  } catch {
    return null
  }
}
