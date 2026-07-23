import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteCustomDomain } from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  if (!siteId || !domainId) return jsonResponse({ error: 'Site ID and domain ID are required' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId)

  const domain = await queryFirst<{ id: string; domain: string }>(db, `
    SELECT *
    FROM site_domains
    WHERE id = ? AND site_id = ? AND type = 'custom'
    LIMIT 1
  `, [domainId, siteId])
  if (!domain) return jsonResponse({ error: 'Domain not found' }, { status: 404 })

  try {
    await deleteCustomDomain(env, db, domainId, site.member_role as 'owner' | 'admin' | 'editor', session.user.id)
    await notifyDomainLifecycle(env, db, {
      organizationId: site.organization_id,
      siteId,
      domain: domain.domain,
      status: 'deleted',
      title: `Domain deleted: ${domain.domain}`,
      message: `${domain.domain} has been removed from KrabiClaw.`,
      dashboardUrl: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/${encodeURIComponent(site.organization_slug ?? site.organization_id)}/sites/${encodeURIComponent(site.subdomain ?? site.id)}/domains`
    })
    return jsonResponse({ success: true })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Failed to delete domain')
    return jsonResponse({ error: normalizedError.message || 'Failed to delete domain' }, { status: 500 })
  }
})
