import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { searchPlaces } from '~/server/utils/google-places'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
  if (!apiKey) {
    return jsonResponse({ error: 'Places API not configured' }, { status: 503 })
  }

  const body = await readBody(event) as { query?: ApiValue }
  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query || query.length < 2) {
    return jsonResponse({ error: 'query must be at least 2 characters' }, { status: 400 })
  }
  if (query.length > 200) {
    return jsonResponse({ error: 'query too long' }, { status: 400 })
  }

  let results
  try {
    results = await searchPlaces(apiKey, query)
  } catch (error) {
    console.error('Places search error:', error)
    return jsonResponse({ error: 'Places search failed' }, { status: 502 })
  }

  if (db) {
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string }
    const activeOrgId = typeof sessionRecord.activeOrganizationId === 'string' ? sessionRecord.activeOrganizationId : ''
    const userOrg = await queryFirst<{ organizationId: string }>(db, `
      SELECT o.id AS organizationId FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC LIMIT 1
    `, [session.user.id, activeOrgId]).catch(() => null)
    if (userOrg) {
      await chargeFlatCredits(db, userOrg.organizationId, { action: 'google_places_search' }).catch(() => {})
    }
  }

  return jsonResponse({ success: true, results })
})
