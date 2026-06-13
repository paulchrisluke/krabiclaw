// PATCH /api/editor/sites/[siteId]/contact-submissions/[submissionId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateContactSubmissionStatus } from '~/server/utils/mcp-workflows'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const body = await readBody(event) as ApiRecord
  const status = cleanString(body.status, 20)
  if (!['new', 'read', 'replied'].includes(status)) {
    return jsonResponse({ error: 'Invalid status' }, { status: 400 })
  }

  try {
    const result = await updateContactSubmissionStatus(db, siteId, submissionId, status)
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Submission update failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
