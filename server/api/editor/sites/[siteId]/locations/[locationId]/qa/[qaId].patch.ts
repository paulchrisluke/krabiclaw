// PATCH /api/editor/sites/[siteId]/locations/[locationId]/qa/[qaId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !locationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.organization_id
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

  const rawBody = await readBody(event)
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = rawBody as ApiRecord
  const sets: string[] = ['updated_at = ?']
  const params: ApiValue[] = [new Date().toISOString()]

  if (body.question !== undefined) {
    const question = cleanString(body.question, 500)
    if (!question) return jsonResponse({ error: 'Question is required' }, { status: 400 })
    sets.push('question = ?')
    params.push(question)
  }
  if (body.answer !== undefined) {
    sets.push('answer = ?')
    params.push(cleanString(body.answer, 2000) || null)
  }
  if (body.question_author !== undefined) {
    sets.push('question_author = ?')
    params.push(cleanString(body.question_author, 120) || null)
  }
  if (body.is_owner_answer !== undefined) {
    let isOwnerAnswer: number
    if (body.is_owner_answer === true || body.is_owner_answer === 1 || body.is_owner_answer === '1') {
      isOwnerAnswer = 1
    } else if (body.is_owner_answer === false || body.is_owner_answer === 0 || body.is_owner_answer === '0') {
      isOwnerAnswer = 0
    } else {
      return jsonResponse({ error: 'is_owner_answer must be a boolean-like value' }, { status: 400 })
    }
    sets.push('is_owner_answer = ?')
    params.push(isOwnerAnswer)
  }
  if (body.status !== undefined) {
    const status = cleanString(body.status, 20)
    if (!['published', 'hidden'].includes(status)) {
      return jsonResponse({ error: 'Invalid status' }, { status: 400 })
    }
    sets.push('status = ?')
    params.push(status)
  }
  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order)
    if (!Number.isInteger(sortOrder)) return jsonResponse({ error: 'sort_order must be an integer' }, { status: 400 })
    sets.push('sort_order = ?')
    params.push(sortOrder)
  }

  if (sets.length === 1) return jsonResponse({ error: 'No update fields provided' }, { status: 400 })

  params.push(qaId, locationId, siteId, site.organization_id)
  const result = await db.prepare(`
    UPDATE location_qa
    SET ${sets.join(', ')}
    WHERE id = ? AND location_id = ? AND site_id = ? AND organization_id = ?
  `).bind(...params).run()

  if (!result.meta.changes) return jsonResponse({ error: 'Q&A not found' }, { status: 404 })

  return jsonResponse({ updated: true })
})
