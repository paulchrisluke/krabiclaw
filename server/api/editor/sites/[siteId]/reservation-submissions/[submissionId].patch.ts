// PATCH /api/editor/sites/[siteId]/reservation-submissions/[submissionId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateReservationSubmissionStatus } from '~/server/utils/mcp-workflows'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst(db, `
    SELECT s.id
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const body = await readBody(event) as { status?: unknown }
  const status = cleanString(body.status, 20)
  if (!['new', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return jsonResponse({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const result = await updateReservationSubmissionStatus(db, siteId, submissionId, status)
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reservation update failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
