// PATCH /api/admin/work-requests/[id] — update status, notes, assignment
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

  const id = getRouterParam(event, 'id')
  if (!id) return jsonResponse({ error: 'ID required' }, { status: 400 })

  let body: {
    status?: string
    priority?: string
    notes?: string
    assigned_to?: string | null
  }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || (typeof body !== 'object') || (!('status' in body) && !('priority' in body) && !('notes' in body) && !('assigned_to' in body))) {
    return jsonResponse({ error: 'At least one updatable field required' }, { status: 400 })
  }

  const VALID_STATUSES = ['pending', 'in_progress', 'done', 'cancelled']
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']
  if ('status' in body && body.status && !VALID_STATUSES.includes(body.status)) {
    return jsonResponse({ error: 'Invalid status' }, { status: 400 })
  }
  if ('priority' in body && body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return jsonResponse({ error: 'Invalid priority' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const completedAt = body.status === 'done' ? now : body.status ? null : undefined

  const result = await db.prepare(`
    UPDATE work_requests SET
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      notes = COALESCE(?, notes),
      assigned_to = CASE WHEN ? = 1 THEN ? ELSE assigned_to END,
      completed_at = CASE
        WHEN ? = 'done' THEN ?
        WHEN ? IS NOT NULL AND ? != 'done' THEN NULL
        ELSE completed_at
      END,
      updated_at = ?
    WHERE id = ?
  `).bind(
    body.status ?? null,
    body.priority ?? null,
    body.notes ?? null,
    'assigned_to' in body ? 1 : 0, body.assigned_to ?? null,
    body.status ?? null, completedAt ?? null,
    body.status ?? null, body.status ?? null,
    now,
    id
  ).run()

  if (result.meta.changes === 0) return jsonResponse({ error: 'Request not found' }, { status: 404 })

  return jsonResponse({ success: true })
})
