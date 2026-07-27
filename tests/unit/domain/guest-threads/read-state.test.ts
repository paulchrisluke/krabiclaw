import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

interface Call {
  query: string
  params: unknown[]
}

const state = {
  execute: [] as Call[],
  cursors: new Map<string, { thread_id: string; member_id: string; last_read_entry_id: string | null; last_read_sequence: number }>(),
  entries: [] as Array<{ id: string; thread_id: string; sequence: number }>,
}

function cursorKey(threadId: string, memberId: string) {
  return `${threadId}:${memberId}`
}

async function execute(_db: unknown, query: string, params: unknown[] = []) {
  state.execute.push({ query, params })
  if (query.includes('INSERT INTO guest_thread_member_state')) {
    const [threadId, memberId, entryId, sequence] = params as [string, string, string | null, number]
    state.cursors.set(cursorKey(threadId, memberId), {
      thread_id: threadId, member_id: memberId, last_read_entry_id: entryId, last_read_sequence: sequence,
    })
  }
  return { meta: { changes: 1 } }
}

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  state.execute.push({ query, params })
  if (query.includes('FROM guest_thread_member_state')) {
    return (state.cursors.get(cursorKey(params[0] as string, params[1] as string)) ?? null) as T | null
  }
  if (query.includes('SELECT sequence FROM guest_thread_entries')) {
    const [entryId, threadId] = params as [string, string]
    const hit = state.entries.find(e => e.id === entryId && e.thread_id === threadId)
    return (hit ? { sequence: hit.sequence } : null) as T | null
  }
  if (query.includes('sequence > ?')) {
    const [threadId, since] = params as [string, number]
    const hit = state.entries.find(e => e.thread_id === threadId && e.sequence > since)
    return (hit ? { id: hit.id } : null) as T | null
  }
  if (query.includes('SELECT id FROM guest_thread_entries WHERE thread_id = ? LIMIT 1')) {
    const hit = state.entries.find(e => e.thread_id === params[0])
    return (hit ? { id: hit.id } : null) as T | null
  }
  return null
}

async function queryAll<T>(_db: unknown, _query: string, _params: unknown[] = []): Promise<T[]> {
  return []
}

mock.module('../../../../server/db/index.ts', {
  namedExports: { execute, queryAll, queryFirst },
})

const { getMemberCursor, advanceMemberCursor, computeUnreadForMember } = await import('../../../../server/domain/guest-threads/read-state.ts')

function reset() {
  state.execute = []
  state.cursors = new Map()
  state.entries = []
}

const db = {} as D1Database

test('a thread with entries and no cursor is unread', async () => {
  reset()
  state.entries.push({ id: 'e1', thread_id: 't1', sequence: 1 })
  const unread = await computeUnreadForMember(db, 't1', 'member-a')
  assert.equal(unread, true)
})

test('advancing one member cursor does not affect another member', async () => {
  reset()
  state.entries.push({ id: 'e1', thread_id: 't1', sequence: 1 })
  await advanceMemberCursor(db, 't1', 'member-a', 'e1')

  const unreadForA = await computeUnreadForMember(db, 't1', 'member-a')
  const unreadForB = await computeUnreadForMember(db, 't1', 'member-b')
  assert.equal(unreadForA, false)
  assert.equal(unreadForB, true)

  const cursorA = await getMemberCursor(db, 't1', 'member-a')
  const cursorB = await getMemberCursor(db, 't1', 'member-b')
  assert.equal(cursorA?.last_read_entry_id, 'e1')
  assert.equal(cursorB, null)
})

test('a new entry after a member read the thread makes it unread again for that member only', async () => {
  reset()
  state.entries.push({ id: 'e1', thread_id: 't1', sequence: 1 })
  await advanceMemberCursor(db, 't1', 'member-a', 'e1')
  assert.equal(await computeUnreadForMember(db, 't1', 'member-a'), false)

  state.entries.push({ id: 'e2', thread_id: 't1', sequence: 2 })
  assert.equal(await computeUnreadForMember(db, 't1', 'member-a'), true)
})
