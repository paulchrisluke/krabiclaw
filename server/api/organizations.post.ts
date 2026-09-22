import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { activateSessionOrganization } from '~/server/utils/session-organization'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import { isCurrencyCode, SUPPORTED_CURRENCIES } from '~/shared/currencies'
import type { SiteVertical } from '~/utils/vertical-copy'

// Adds a site to an organization the caller already belongs to. The organization
// is explicit: the dashboard sends the route's `org` query param (dashboardFetch),
// API callers send `organizationId` in the body. Nothing is inferred from memberships.
export default defineHandler(async (event) => {
  const body = await readBody<{ name?: string; subdomain?: string; vertical?: string; organizationId?: string; defaultCurrency?: string }>(event)
  const name = body?.name?.trim()
  const subdomain = body?.subdomain?.trim()
  const vertical = body?.vertical
  const explicitOrganizationId = body?.organizationId?.trim() || null

  if (!name || !subdomain) {
    return jsonResponse({ error: 'name and subdomain are required' }, { status: 400 })
  }
  if (!vertical || !VALID_VERTICALS.includes(vertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`
    }, { status: 400 })
  }
  // This site is public the moment it is created, so it cannot start without a
  // currency to quote its prices in. The caller states it; nothing here guesses
  // one from the organization's other sites.
  const defaultCurrency = typeof body?.defaultCurrency === 'string' ? body.defaultCurrency.trim().toUpperCase() : ''
  if (!isCurrencyCode(defaultCurrency)) {
    return jsonResponse({
      error: `defaultCurrency is required and must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const organization = await resolveRequestedOrganization(event, db, session.user.id, { explicitOrganizationId })
  if (!organization) {
    return jsonResponse({
      error: 'organizationId (or the dashboard `org` query param) is required and must name an organization you belong to',
    }, { status: 400 })
  }

  const result = await runSiteCreation(env, db, session.user.id, {
    organizationId: organization.id,
    name,
    subdomain,
    vertical: vertical as SiteVertical,
    defaultCurrency,
  })
  if (result.status === 200) {
    // The site exists at this point; a failed activation must not turn that into a
    // 500. It is logged loudly and the caller still gets the created site.
    try {
      await activateSessionOrganization(event, env, organization.id)
    } catch (error) {
      console.error('site_creation_activate_organization_failed', { organizationId: organization.id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return jsonResponse(result.data, { status: result.status })
})
