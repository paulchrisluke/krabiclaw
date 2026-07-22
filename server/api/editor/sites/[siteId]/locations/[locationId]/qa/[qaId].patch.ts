// PATCH /api/editor/sites/[siteId]/locations/[locationId]/qa/[qaId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateLocationQa } from '~/server/utils/mcp-workflows'
import { assertLocationAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !locationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT s.organization_id, m.id AS member_id, m.role AS member_role
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ?
    LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  await assertLocationAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId })

  const rawBody = await readBody(event)
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = rawBody as {
    question?: unknown
    answer?: unknown
    question_author?: unknown
    is_owner_answer?: unknown
    status?: unknown
    sort_order?: unknown
  }

  try {
    const result = await updateLocationQa(db, site.organization_id, siteId, locationId, qaId, {
      question: body.question !== undefined ? cleanString(body.question, 500) : undefined,
      answer: body.answer !== undefined ? cleanString(body.answer, 2000) : undefined,
      question_author: body.question_author !== undefined ? cleanString(body.question_author, 120) : undefined,
      is_owner_answer: body.is_owner_answer,
      status: body.status !== undefined ? cleanString(body.status, 20) : undefined,
      sort_order: body.sort_order,
    })
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A update failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
