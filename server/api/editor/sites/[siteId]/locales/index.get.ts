import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listSiteLocales } from '~/server/utils/site-locales'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string; member_id: string; member_role: string }>(db, `
    SELECT s.id, s.organization_id, om.id AS member_id, om.role AS member_role FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ?
    LIMIT 1
  `, [siteId, session.user.id])

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  await assertSiteWideAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId })

  const result = await listSiteLocales(db, site.organization_id, siteId)
  return jsonResponse({ success: true, ...result })
})
