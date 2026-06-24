import { getQuery } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryAll } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const stuckOnly = String(query.stuck || '') === 'true'
  const params: ApiRecord[] = []
  const where = [`sd.type = 'custom'`, `sd.status != 'deleted'`]

  if (search) {
    where.push(`(lower(sd.domain) LIKE ? OR lower(s.brand_name) LIKE ? OR lower(o.name) LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  if (stuckOnly) {
    where.push(`sd.status IN ('pending', 'verifying', 'failed', 'blocked')`)
  }

  const domains = await queryAll(db, `
    SELECT sd.*, s.brand_name AS site_name, o.name AS organization_name
    FROM site_domains sd
    JOIN sites s ON s.id = sd.site_id
    JOIN organization o ON o.id = sd.organization_id
    WHERE ${where.join(' AND ')}
    ORDER BY sd.status = 'active' ASC, sd.updated_at DESC
    LIMIT 100
  `, params)

  const events = await queryAll(db, `
    SELECT e.*, sd.domain
    FROM site_domain_events e
    JOIN site_domains sd ON sd.id = e.domain_id
    JOIN sites s ON s.id = sd.site_id
    JOIN organization o ON o.id = sd.organization_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT 100
  `, params)

  return jsonResponse({ success: true, domains: domains || [], events: events || [] })
})
