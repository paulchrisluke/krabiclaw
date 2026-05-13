import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteCustomDomain } from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  if (!siteId || !domainId) return jsonResponse({ error: 'Site ID and domain ID are required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })


  // Fetch member role for audit/authorization
  const site = await db.prepare(`
    SELECT s.id, s.organization_id, m.role as member_role
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const domain = await db.prepare(`
    SELECT *
    FROM site_domains
    WHERE id = ? AND site_id = ? AND type = 'custom'
    LIMIT 1
  `).bind(domainId, siteId).first()
  if (!domain) return jsonResponse({ error: 'Domain not found' }, { status: 404 })

  try {
    await deleteCustomDomain(env, db, domainId, site.member_role || 'owner', session.user.id)
    await notifyDomainLifecycle(env, db, {
      organizationId: site.organization_id,
      siteId,
      domain: domain.domain,
      status: 'deleted',
      title: `Domain deleted: ${domain.domain}`,
      message: `${domain.domain} has been removed from KrabiClaw.`,
      dashboardUrl: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/sites/${siteId}/settings`
    })
    return jsonResponse({ success: true })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to delete domain' }, { status: 500 })
  }
})
