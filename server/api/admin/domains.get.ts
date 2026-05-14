import { getQuery } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const stuckOnly = String(query.stuck || '') === 'true'
  const params: ApiRecord[] = []
  const where = [`sd.type = 'custom'`, `sd.status != 'deleted'`]

  if (search) {
    where.push(`(lower(sd.domain) LIKE ? OR lower(s.name) LIKE ? OR lower(o.name) LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  if (stuckOnly) {
    where.push(`sd.status IN ('pending', 'verifying', 'failed', 'blocked')`)
  }

  const domains = await db.prepare(`
    SELECT sd.*, s.name AS site_name, o.name AS organization_name
    FROM site_domains sd
    JOIN sites s ON s.id = sd.site_id
    JOIN organization o ON o.id = sd.organization_id
    WHERE ${where.join(' AND ')}
    ORDER BY sd.status = 'active' ASC, sd.updated_at DESC
    LIMIT 100
  `).bind(...params).all()

  const events = await db.prepare(`
    SELECT e.*, sd.domain
    FROM site_domain_events e
    JOIN site_domains sd ON sd.id = e.domain_id
    JOIN sites s ON s.id = sd.site_id
    JOIN organization o ON o.id = sd.organization_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT 100
  `).bind(...params).all()

  return jsonResponse({ success: true, domains: domains.results || [], events: events.results || [] })
})
