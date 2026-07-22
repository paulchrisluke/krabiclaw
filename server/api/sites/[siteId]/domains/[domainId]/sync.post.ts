import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { domainInstructions, syncDomainWithCloudflare } from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'
import { requireSiteAccess } from '~/server/utils/location-access'

interface DomainRecordRow {
  id: string
  site_id: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const domainId = getRouterParam(event, 'domainId')
  if (typeof siteId !== 'string' || !siteId.trim() || typeof domainId !== 'string' || !domainId.trim()) {
    return jsonResponse({ error: 'Site ID and domain ID are required' }, { status: 400 })
  }

  const { env, db, session, site } = await requireSiteAccess(event, siteId)

  const domainRecord = await queryFirst<DomainRecordRow>(db, `
    SELECT id, site_id
    FROM site_domains
    WHERE id = ?
    LIMIT 1
  `, [domainId])
  if (!domainRecord || domainRecord.site_id !== site.id) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  try {
    const domain = await syncDomainWithCloudflare(env, db, domainId, site.member_role as 'owner' | 'admin' | 'editor', session.user.id)
    if (domain.site_id !== site.id) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    await notifyDomainLifecycle(env, db, {
      organizationId: site.organization_id,
      siteId,
      domain: domain.domain,
      status: domain.status,
      title: `Domain synced: ${domain.domain}`,
      message: `${domain.domain} is now ${domain.status}.`,
      dashboardUrl: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/${encodeURIComponent(site.organization_slug ?? site.organization_id)}/settings/domains?site=${encodeURIComponent(site.subdomain ?? site.id)}`
    })
    return jsonResponse({ success: true, domain: { ...domain, instructions: domainInstructions(domain) } })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('domain_sync_failed', {
      siteId,
      domainId,
      userId: session.user.id,
      error: normalizedError.message,
      stack: normalizedError.stack ?? null
    })
    return jsonResponse({ error: 'Failed to sync domain' }, { status: 500 })
  }
})
