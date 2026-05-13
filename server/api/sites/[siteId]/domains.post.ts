import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import {
  createCustomDomainPair,
  domainInstructions,
  domainPair,
  hasCustomDomainsEntitlement,
  validateCustomDomain
} from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as { domain?: string; include_www?: boolean }
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  if (!body.domain) return jsonResponse({ error: 'Domain is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })


  // Fetch site and member role for actor attribution
  const siteResult = await db.prepare(`
    SELECT s.id, s.organization_id, s.name, m.role as member_role
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first()
  if (!siteResult) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  // For backward compatibility with existing code
  const site = {
    id: siteResult.id,
    organization_id: siteResult.organization_id,
    name: siteResult.name
  }
  const actorType = siteResult.member_role || 'owner'


  if (!(await hasCustomDomainsEntitlement(db, site.organization_id))) {
    return jsonResponse({ error: 'Custom domains require a paid plan.' }, { status: 403 })
  }

  const validation = validateCustomDomain(env, body.domain)
  if (!validation.valid) return jsonResponse({ error: validation.reason }, { status: 400 })


  try {
    const domains = await createCustomDomainPair(env, db, {
      siteId,
      organizationId: site.organization_id,
      domain: body.domain,
      includeWww: body.include_www !== false,
      actorId: session.user.id,
      actorType
    })

    const dashboardUrl = `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/sites/${siteId}/settings`
    for (const domain of domains) {
      await notifyDomainLifecycle(env, db, {
        organizationId: site.organization_id,
        siteId,
        domain: domain.domain,
        status: domain.status,
        title: `Domain added: ${domain.domain}`,
        message: `DNS setup is ready for ${domain.domain}.`,
        dashboardUrl
      })
    }

    return jsonResponse({
      success: true,
      domains: domains.map((domain) => ({ ...domain, instructions: domainInstructions(domain) })),
      requested_hostnames: domainPair(body.domain, body.include_www !== false)
    })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to add domain' }, { status: 500 })
  }
})
