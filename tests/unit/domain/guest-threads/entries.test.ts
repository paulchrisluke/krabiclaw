import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

interface Call {
  query: string
  params: unknown[]
}

const calls = {
  execute: [] as Call[],
  rows: new Map<string, Record<string, unknown>>(),
  counters: new Map<string, number>(),
  nextInsertId: '',
  throwOnInsert: null as Error | null,
}

async function execute(_db: unknown, query: string, params: unknown[] = []) {
  calls.execute.push({ query, params })
  if (query.includes('INSERT INTO guest_thread_sequence_counters')) {
    const [threadId, sequenceThreadId] = params as [string, string]
    if (!calls.counters.has(threadId)) {
      const maxSequence = Math.max(0, ...[...calls.rows.values()].filter(row => row.thread_id === sequenceThreadId).map(row => Number(row.sequence ?? 0)))
      calls.counters.set(threadId, maxSequence + 1)
    }
  }
  if (query.includes('INSERT INTO guest_thread_entries')) {
    if (calls.throwOnInsert) {
      const err = calls.throwOnInsert
      calls.throwOnInsert = null
      throw err
    }
    const [id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body, event_name, payload_json, external_id, sequence, occurred_at, created_at] = params
    calls.rows.set(id as string, {
      id, thread_id, organization_id, site_id, kind, actor_kind, actor_user_id, channel, body,
      event_name, payload_json, external_id, sequence, occurred_at, created_at,
    })
  }
  return { meta: { changes: 1 } }
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  calls.execute.push({ query, params })
  if (query.includes('UPDATE guest_thread_sequence_counters')) {
    const threadId = params[1] as string
    const sequence = calls.counters.get(threadId)
    if (!sequence) return null
    calls.counters.set(threadId, sequence + 1)
    return { sequence } as T
  }
  if (query.includes('WHERE id = ?')) {
    return (calls.rows.get(params[0] as string) ?? null) as T | null
  }
  if (query.includes('WHERE external_id = ?')) {
    for (const row of calls.rows.values()) {
      if (row.external_id === params[0]) return row as T
    }
    return null
  }
  if (query.includes('ORDER BY sequence DESC')) {
    const rows = [...calls.rows.values()].filter(r => r.thread_id === params[0])
    rows.sort((a, b) => Number(b.sequence ?? 0) - Number(a.sequence ?? 0) || String(b.occurred_at).localeCompare(String(a.occurred_at)))
    return (rows[0] ?? null) as T | null
  }
  return null
}

async function queryAll<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T[]> {
  calls.execute.push({ query, params })
  if (query.includes('FROM guest_thread_entries')) {
    const rows = [...calls.rows.values()].filter(r => r.thread_id === params[0])
    rows.sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0) || String(a.occurred_at).localeCompare(String(b.occurred_at)))
    return rows as T[]
  }
  return []
}

mock.module('../../../../server/db/index.ts', {
  namedExports: { execute, queryAll, queryFirst },
})

const { appendEntry, listThreadEntries, findEntryByExternalId } = await import('../../../../server/domain/guest-threads/entries.ts')

function reset() {
  calls.execute = []
  calls.rows = new Map()
  calls.counters = new Map()
  calls.throwOnInsert = null
}

const db = {} as D1Database

test('appendEntry persists a fact with the provided occurred_at ordering intact', async () => {
  reset()
  const a = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'submission', actorKind: 'guest', occurredAt: '2026-01-01T00:00:00.000Z',
  })
  const b = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'message', actorKind: 'guest', body: 'hi', occurredAt: '2026-01-02T00:00:00.000Z',
  })
  const entries = await listThreadEntries(db, 't1')
  assert.equal(entries.length, 2)
  assert.equal(entries[0].id, a.id)
  assert.equal(entries[1].id, b.id)
})

test('appendEntry with an existing external_id returns the existing entry instead of duplicating', async () => {
  reset()
  const first = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'message', actorKind: 'guest', body: 'hello', externalId: 'msg-abc',
  })
  const second = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'message', actorKind: 'guest', body: 'hello again', externalId: 'msg-abc',
  })
  assert.equal(second.id, first.id)
  assert.equal(second.body, 'hello')
  const entries = await listThreadEntries(db, 't1')
  assert.equal(entries.length, 1)
})

test('appendEntry recovers from a concurrent UNIQUE-constraint race on external_id', async () => {
  reset()
  const first = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'message', actorKind: 'guest', body: 'race', externalId: 'race-1',
  })
  calls.throwOnInsert = new Error('UNIQUE constraint failed: guest_thread_entries.external_id')
  // Simulate a second concurrent insert attempt with the same external id colliding.
  calls.rows.set(first.id, { ...calls.rows.get(first.id), external_id: 'race-1' } as Record<string, unknown>)
  const second = await appendEntry(db, {
    threadId: 't1', organizationId: 'org1', siteId: 'site1',
    kind: 'message', actorKind: 'guest', body: 'race-dup', externalId: 'race-1',
  })
  assert.equal(second.id, first.id)
})

test('findEntryByExternalId returns null for unknown ids', async () => {
  reset()
  const result = await findEntryByExternalId(db, 'does-not-exist')
  assert.equal(result, null)
})
