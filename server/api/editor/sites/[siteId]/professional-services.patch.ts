import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { upsertProfessionalServiceContent } from '~/server/utils/professional-services-editor'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB || env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  await assertSiteWideAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId })

  let body: ApiRecord
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await upsertProfessionalServiceContent(db, {
      organizationId: site.organization_id,
      siteId,
      data: body,
      updatedBy: session.user.id,
    })
    return jsonResponse(result)
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid professional-service content' }, { status: 400 })
  }
})
