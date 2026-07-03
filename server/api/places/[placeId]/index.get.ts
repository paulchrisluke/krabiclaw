import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPlaceDetails } from '~/server/utils/google-places'
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

  const placeId = getRouterParam(event, 'placeId')
  if (!placeId || placeId.length > 300) {
    return jsonResponse({ error: 'Invalid place ID' }, { status: 400 })
  }

  let details
  try {
    details = await getPlaceDetails(apiKey, placeId)
  } catch (error) {
    console.error('Places detail error:', error)
    return jsonResponse({ error: 'Failed to fetch place details' }, { status: 502 })
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
      const chargeResult = await chargeFlatCredits(db, userOrg.organizationId, { action: 'google_places_details' })
        .catch((error) => {
          console.error('chargeFlatCredits threw for google_places_details:', error)
          return null
        })
      if (chargeResult && !chargeResult.charged) {
        console.error('chargeFlatCredits did not charge for google_places_details', {
          organizationId: userOrg.organizationId,
          newBalance: chargeResult.newBalance,
        })
      }
    }
  }

  return jsonResponse({ success: true, details })
})
