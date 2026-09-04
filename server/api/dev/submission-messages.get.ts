import { defineHandler } from 'nitro'

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { queryAll } from '~/server/db'

export default defineHandler(async (event) => {
  assertDevRouteAllowed(event)
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const submissionType = query.submission_type as string | undefined
  const submissionId = query.submission_id as string | undefined
  const siteId = query.site_id as string | undefined
  const direction = query.direction as string | undefined
  const channel = query.channel as string | undefined
  const since = query.since as string | undefined
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? '200'), 10) || 200, 1), 500)

  // e2e inspection route for the canonical guest-thread ledger (issue #442). Joins
  // guest_threads so specs that only know the source submission type/id (not the
  // thread id) can still filter, the same way the old submission_messages table did.
  let sql = `
    SELECT e.id, gt.submission_type, gt.submission_id, e.organization_id, e.site_id, e.actor_kind, e.channel, e.body, e.actor_user_id, e.dedupe_key, e.occurred_at, e.created_at
    FROM guest_thread_entries e
    JOIN guest_threads gt ON gt.id = e.thread_id
    WHERE e.kind = 'message'
  `
  const binds: string[] = []

  if (submissionType) { sql += ' AND gt.submission_type = ?'; binds.push(submissionType) }
  if (submissionId) { sql += ' AND gt.submission_id = ?'; binds.push(submissionId) }
  if (siteId) { sql += ' AND e.site_id = ?'; binds.push(siteId) }
  if (direction) {
    // Legacy 'in'/'out' direction maps onto actor_kind: guest-authored messages are
    // inbound, member-authored messages are outbound.
    sql += ' AND e.actor_kind = ?'
    binds.push(direction === 'in' ? 'guest' : 'member')
  }
  if (channel) { sql += ' AND e.channel = ?'; binds.push(channel) }
  if (since) { sql += ' AND e.occurred_at >= ?'; binds.push(since) }

  sql += ' ORDER BY e.occurred_at DESC LIMIT ?'
  binds.push(String(limit))

  const rows = await queryAll<{ actor_kind: string }>(db, sql, binds)
  const messages = (rows ?? []).map(row => ({
    ...row, direction: row.actor_kind === 'guest' ? 'in' : 'out', }))
  return jsonResponse({ messages })
})
import {  getQuery  } from 'nitro/h3';
