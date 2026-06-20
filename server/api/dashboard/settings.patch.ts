// Direct dashboard settings update handler.
// Avoids the generic dashboard proxy hop for this request path.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isDemoOrg } from '~/server/utils/demo'
import { updateSiteSettingsFields } from '~/server/utils/site-settings'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'
import { createError, getHeader, readBody } from 'h3'

function timingSafeEqualText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as UpdateSiteSettingsRequest
  const forceSubdomainRegistrationFailure = getHeader(event, 'x-e2e-force-subdomain-failure') === 'true'

  if (typeof body !== 'object' || body === null || Object.keys(body).length === 0) {
    return jsonResponse(
      { error: 'No update fields provided' },
      { status: 400 },
    )
  }

  const env = cloudflareEnv(event)
  const { db, session, organization, restaurant } = await getDashboardContext(event, { requireRestaurant: true })

  if (!restaurant) {
    return jsonResponse({ error: 'Restaurant not found' }, { status: 404 })
  }

  if (forceSubdomainRegistrationFailure) {
    const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
    if (!e2eOverride || !expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  try {
    const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
    if (isDemoOrg(organization.id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    const result = await updateSiteSettingsFields(
      db,
      env,
      restaurant.id,
      organization.id,
      body,
      session.user.id,
      { forceSubdomainRegistrationFailure },
    )

    return jsonResponse(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse(
      { error: 'Failed to update site settings' },
      { status: 500 },
    )
  }
})
