import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll } from '~/server/db'

const enc = new TextEncoder()

function timingSafeEqualText(a: string, b: string): boolean {
  const left = enc.encode(a)
  const right = enc.encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expected = process.env.E2E_DEV_ROUTE_SECRET || ''
    const provided = getHeader(event, 'x-dev-route-secret') || ''
    if (!expected || !provided || !timingSafeEqualText(provided, expected)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

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

  let sql = `SELECT id, submission_type, submission_id, organization_id, site_id, direction, channel, body, sender_user_id, meta_message_id, status, error, created_at
             FROM submission_messages WHERE 1=1`
  const binds: string[] = []

  if (submissionType) { sql += ' AND submission_type = ?'; binds.push(submissionType) }
  if (submissionId) { sql += ' AND submission_id = ?'; binds.push(submissionId) }
  if (siteId) { sql += ' AND site_id = ?'; binds.push(siteId) }
  if (direction) { sql += ' AND direction = ?'; binds.push(direction) }
  if (channel) { sql += ' AND channel = ?'; binds.push(channel) }
  if (since) { sql += ' AND created_at >= ?'; binds.push(since) }

  sql += ' ORDER BY created_at DESC LIMIT ?'
  binds.push(String(limit))

  const rows = await queryAll(db, sql, binds)
  return jsonResponse({ messages: rows ?? [] })
})
