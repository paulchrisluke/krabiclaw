// PATCH /api/editor/sites/[siteId]/contact-submissions/[submissionId]
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateContactSubmissionStatus } from '~/server/utils/mcp-workflows'
import { assertResourceAccess } from '~/server/utils/member-access'
import { getGuestThreadSource } from '~/server/utils/guest-threads'
import { loadMemberSiteRow } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const source = await getGuestThreadSource(db, 'contact', submissionId)
  if (!source || source.site_id !== siteId || source.organization_id !== site.organization_id) {
    return jsonResponse({ error: 'Submission not found' }, { status: 404 })
  }
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: source.location_id,
  })

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
