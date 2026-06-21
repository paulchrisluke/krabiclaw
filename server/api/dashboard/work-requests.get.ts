// GET /api/dashboard/work-requests — managed client views their own requests
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  const rows = await db.prepare(`
    SELECT id, type, title, description, status, priority, source, notes, created_at, updated_at, completed_at
    FROM work_requests
    WHERE organization_id = ?
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 100
  `).bind(organization.id).all()

  return jsonResponse({ requests: rows.results ?? [] })
})
