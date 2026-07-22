// PATCH /api/editor/sites/[siteId]/contact-submissions/[submissionId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateContactSubmissionStatus } from '~/server/utils/mcp-workflows'
import { assertSiteWideAccess } from '~/server/utils/member-access'
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

  const site = await queryFirst<{ id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT s.id, s.organization_id, m.id AS member_id, m.role AS member_role
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  await assertSiteWideAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId })

  const body = await readBody(event) as { status?: unknown }
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
