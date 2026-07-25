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

/**
 * Appends one immutable fact to the canonical guest-thread ledger. Entries are never
 * updated in place — corrections are new entries (issue #442 Locked Decision #2).
 *
 * When `externalId` is provided and already exists, returns the existing entry instead
 * of inserting a duplicate (idempotent inbound ingestion — e.g. inbound email Message-Id,
 * WhatsApp message id).
 */
export async function appendEntry(db: DbClient, input: AppendEntryInput): Promise<GuestThreadEntryRow> {
  if (input.externalId) {
    const existing = await findEntryByExternalId(db, input.externalId)
    if (existing) return existing
  }

  const id = input.id ?? crypto.randomUUID()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const createdAt = new Date().toISOString()
  const payloadJson = input.payloadJson ? JSON.stringify(input.payloadJson) : null

  try {
    await execute(db, `
      INSERT INTO guest_thread_entries
        (id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, external_id, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      occurredAt,
      createdAt,
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (input.externalId && /UNIQUE constraint failed/i.test(message)) {
      const concurrent = await findEntryByExternalId(db, input.externalId)
      if (concurrent) return concurrent
    }
    throw error instanceof Error ? error : new Error(message)
  }

  const created = await queryFirst<GuestThreadEntryRow>(db, `SELECT * FROM guest_thread_entries WHERE id = ? LIMIT 1`, [id])
  if (!created) throw new Error('Failed to load appended guest thread entry')
  return created
}

export async function findEntryByExternalId(db: DbClient, externalId: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries WHERE external_id = ? LIMIT 1
  `, [externalId])
}

export async function listThreadEntries(db: DbClient, threadId: string): Promise<GuestThreadEntryRow[]> {
  const rows = await queryAll<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ?
    ORDER BY occurred_at ASC, created_at ASC
  `, [threadId])
  return rows ?? []
}

export async function getLatestEntry(db: DbClient, threadId: string): Promise<GuestThreadEntryRow | null> {
  return await queryFirst<GuestThreadEntryRow>(db, `
    SELECT * FROM guest_thread_entries
    WHERE thread_id = ?
    ORDER BY occurred_at DESC, created_at DESC
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
    ORDER BY occurred_at DESC, created_at DESC
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
