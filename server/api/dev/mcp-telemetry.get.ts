import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
  assertDevRouteAllowed(event)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? '50'), 10) || 50, 1), 200)
  const since = typeof query.since === 'string' ? query.since : null
  const method = typeof query.method === 'string' ? query.method : null
  const toolName = typeof query.tool_name === 'string' ? query.tool_name : null
  const surface = typeof query.mcp_surface === 'string' ? query.mcp_surface : null
  const status = typeof query.status === 'string' ? query.status : null

  let sql = `
    SELECT
      id,
      mcp_surface,
      method,
      tool_name,
      tool_domain,
      status,
      error_code,
      error_message,
      duration_ms,
      created_at
    FROM mcp_tool_call_events
    WHERE 1 = 1
  `
  const binds: string[] = []

  if (since) {
    sql += ' AND created_at >= ?'
    binds.push(since)
  }
  if (method) {
    sql += ' AND method = ?'
    binds.push(method)
  }
  if (toolName) {
    sql += ' AND tool_name = ?'
    binds.push(toolName)
  }
  if (surface) {
    sql += ' AND mcp_surface = ?'
    binds.push(surface)
  }
  if (status) {
    sql += ' AND status = ?'
    binds.push(status)
  }

  sql += ' ORDER BY created_at DESC LIMIT ?'
  binds.push(String(limit))

  const events = await queryAll(db, sql, binds)
  return jsonResponse({ events: events ?? [] })
})
