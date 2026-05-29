// GET /api/admin/work-requests — platform admin views all work requests
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })


  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  // Require DB user role 'admin'
  const userRow = await db.prepare('SELECT role FROM user WHERE lower(email) = lower(?) LIMIT 1').bind(session.user.email).first<{ role: string }>()
  if (!userRow || userRow.role !== 'admin') return jsonResponse({ error: 'Admin role required' }, { status: 403 })

  const query = getQuery(event)
  const statusFilter = query.status ? String(query.status) : null
  const showDone = query.done === '1'

  const rows = await db.prepare(`
    SELECT
      wr.id, wr.type, wr.title, wr.description, wr.status, wr.priority,
      wr.source, wr.notes, wr.assigned_to, wr.created_at, wr.updated_at, wr.completed_at,
      o.name AS org_name, o.slug AS org_slug,
      s.brand_name
    FROM work_requests wr
    JOIN organization o ON o.id = wr.organization_id
    LEFT JOIN sites s ON s.id = wr.site_id
    WHERE (? IS NULL OR wr.status = ?)
    AND (? = 1 OR wr.status != 'done')
    ORDER BY
      CASE wr.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      CASE wr.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      wr.created_at DESC
    LIMIT 200
  `).bind(statusFilter, statusFilter, showDone ? 1 : 0).all()

  return jsonResponse({ requests: rows.results ?? [] })
})
