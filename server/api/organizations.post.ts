import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import { activateSessionOrganization } from '~/server/utils/session-organization'
import { provisionOrganization, VALID_VERTICALS } from '~/server/utils/organization-provisioning'
import { isCurrencyCode, SUPPORTED_CURRENCIES } from '~/shared/currencies'
import type { SiteVertical } from '~/utils/vertical-copy'

// Provisions an organization the caller already belongs to: gives it its
// address, its template and its seeded structure. The organization is explicit:
// the dashboard sends the route's `org` query param (dashboardFetch), API
// callers send `organizationId` in the body. Nothing is inferred from memberships.
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
  // The tenant is public the moment it is provisioned, so it cannot start
  // without a currency to quote its prices in. The caller states it; nothing
  // here guesses one.
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

  const result = await provisionOrganization(env, db, session.user.id, {
    organizationId: organization.id,
    name,
    subdomain,
    vertical: vertical as SiteVertical,
    defaultCurrency,
  })
  if (result.status === 200) {
    // The tenant is live at this point; a failed activation must not turn that
    // into a 500. It is logged loudly and the caller still gets the result.
    try {
      await activateSessionOrganization(event, env, organization.id)
    } catch (error) {
      console.error('organization_provisioning_activate_session_failed', { organizationId: organization.id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return jsonResponse(result.data, { status: result.status })
})
