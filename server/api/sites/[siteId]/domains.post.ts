import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import {
  createCustomDomainPair,
  canonicalDomainForPair,
  domainInstructions,
  domainPair,
  groupCustomDomains,
  hasCustomDomainsEntitlement,
  inspectDomainResolution,
  validateCustomDomain
} from '~/server/utils/domains'
import { notifyDomainLifecycle } from '~/server/utils/domain-notifications'

interface CreateDomainBody {
  domain?: string
  include_www?: boolean
  acknowledge_live_cutover?: boolean
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody<CreateDomainBody>(event)
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  if (!body || typeof body !== 'object') return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  const requestedDomain = typeof body.domain === 'string' ? body.domain.trim() : ''
  const includeWww = body.include_www !== false
  if (!requestedDomain) return jsonResponse({ error: 'Domain is required' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId)
  const actorType = site.member_role as 'owner' | 'admin' | 'editor'


  if (!(await hasCustomDomainsEntitlement(db, siteId))) {
    return jsonResponse({ error: 'Custom domains require a paid plan.' }, { status: 403 })
  }

  const validation = validateCustomDomain(env, requestedDomain)
  if (!validation.valid) return jsonResponse({ error: validation.reason }, { status: 400 })

  const canonicalHostname = canonicalDomainForPair(requestedDomain, includeWww)
  const liveResolution = await inspectDomainResolution(env, canonicalHostname).catch(() => null)
  if (liveResolution?.resolves_elsewhere && body.acknowledge_live_cutover !== true) {
    return jsonResponse({
      error: 'This domain currently points somewhere else.',
      live_cutover_warning: {
        hostname: liveResolution.hostname,
        records: liveResolution.records,
        message: 'This domain currently points elsewhere and may be live. Changing DNS now can take it offline until KrabiClaw validation finishes.',
      },
    }, { status: 409 })
  }

  try {
    const domains = await createCustomDomainPair(env, db, {
      siteId,
      organizationId: site.organization_id,
      domain: requestedDomain,
      includeWww,
      actorId: session.user.id,
      actorType
    })

    const dashboardUrl = `${env.NUXT_PUBLIC_PLATFORM_DOMAIN}/dashboard/${encodeURIComponent(site.organization_slug ?? site.organization_id)}/sites/${encodeURIComponent(site.subdomain ?? site.id)}/domains`
    for (const domain of domains) {
      await notifyDomainLifecycle(env, db, {
        organizationId: site.organization_id,
        siteId,
        domain: domain.domain,
        status: domain.status,
        title: `Domain added: ${domain.domain}`,
        message: `DNS configuration is required for ${domain.domain}. Follow the dashboard instructions to complete setup.`,
        dashboardUrl
      })
    }

    return jsonResponse({
      success: true,
      domains: domains.map((domain) => ({ ...domain, instructions: domainInstructions(domain) })),
      domain_groups: groupCustomDomains(domains),
      requested_hostnames: domainPair(requestedDomain, includeWww)
    })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error')
    console.error('domains_create_failed', {
      siteId,
      organizationId: site.organization_id,
      userId: session.user.id,
      requestedDomain,
      error: normalizedError.message,
      stack: normalizedError.stack || null
    })
    return jsonResponse({ error: 'Failed to add domain' }, { status: 500 })
  }
})
