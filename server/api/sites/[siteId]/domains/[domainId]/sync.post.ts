import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { domainInstructions, syncDomainWithCloudflare } from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'

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

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const domainRecord = await db.prepare(`
    SELECT id, site_id
    FROM site_domains
    WHERE id = ?
    LIMIT 1
  `).bind(domainId).first<DomainRecordRow>()
  if (!domainRecord || domainRecord.site_id !== site.id) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  try {
    const domain = await syncDomainWithCloudflare(env, db, domainId, 'owner', session.user.id)
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
      dashboardUrl: `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/settings`
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
