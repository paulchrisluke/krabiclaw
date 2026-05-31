// Dev-only endpoint for E2E test notification verification
// Returns notification records matching query params. 404 in production.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const siteId = query.site_id as string | undefined
  const organizationId = query.organization_id as string | undefined
  const template = query.template as string | undefined
  const channel = query.channel as string | undefined
  const since = query.since as string | undefined

  if (!siteId && !organizationId) {
    return jsonResponse({ error: 'site_id or organization_id required' }, { status: 400 })
  }

  let sql = `SELECT id, organization_id, site_id, channel, template, title, recipient, status, error, sent_at, created_at
             FROM notifications WHERE 1=1`
  const binds: string[] = []

  if (siteId) { sql += ' AND site_id = ?'; binds.push(siteId) }
  if (organizationId) { sql += ' AND organization_id = ?'; binds.push(organizationId) }
  if (template) { sql += ' AND template = ?'; binds.push(template) }
  if (channel) { sql += ' AND channel = ?'; binds.push(channel) }
  if (since) { sql += ' AND created_at >= ?'; binds.push(since) }

  sql += ' ORDER BY created_at DESC LIMIT 50'

  const rows = await db.prepare(sql).bind(...binds).all()
  return jsonResponse({ notifications: rows.results ?? [] })
})
