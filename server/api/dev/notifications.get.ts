// Dev-only endpoint for E2E test notification verification
// Returns notification records matching query params. 404 in production.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expected = process.env.E2E_DEV_ROUTE_SECRET || ''
    const provided = getHeader(event, 'x-dev-route-secret') || ''
    if (!expected || !provided || provided !== expected) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const siteId = query.site_id as string | undefined
  const organizationId = query.organization_id as string | undefined
  const template = query.template as string | undefined
  const channel = query.channel as string | undefined
  const status = query.status as string | undefined
  const since = query.since as string | undefined
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? '200'), 10) || 200, 1), 500)

  let sql = `SELECT id, organization_id, site_id, channel, template, title, recipient, payload, provider_message_id, status, error, sent_at, created_at
             FROM notifications WHERE 1=1`
  const binds: string[] = []

  if (siteId) { sql += ' AND site_id = ?'; binds.push(siteId) }
  if (organizationId) { sql += ' AND organization_id = ?'; binds.push(organizationId) }
  if (template) { sql += ' AND template = ?'; binds.push(template) }
  if (channel) { sql += ' AND channel = ?'; binds.push(channel) }
  if (status) { sql += ' AND status = ?'; binds.push(status) }
  if (since) { sql += ' AND created_at >= ?'; binds.push(since) }

  sql += ' ORDER BY created_at DESC LIMIT ?'
  binds.push(String(limit))

  const rows = await db.prepare(sql).bind(...binds).all()
  return jsonResponse({ notifications: rows.results ?? [] })
})
