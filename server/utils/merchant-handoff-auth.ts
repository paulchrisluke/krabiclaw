import { HTTPError } from 'nitro'
import type { H3Event } from 'nitro'
import { setResponseHeader } from 'nitro/h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { assertLocationAccess, resolveOrganizationMembership } from '~/server/utils/member-access'
import { requireMcpUser } from '~/server/utils/mcp-auth'
import { getMerchantHandoffOrder } from '~/server/utils/merchant-handoff'

function authBaseUrl(event: H3Event): string {
  const raw = cloudflareEnv(event).BETTER_AUTH_URL
  if (typeof raw === 'string' && raw.trim()) return raw.replace(/\/$/, '')
  return 'https://krabiclaw.com'
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode
  if ('status' in error && typeof error.status === 'number') return error.status
  return null
}

export async function requireMerchantHandoffCaller(event: H3Event, orderId: string) {
  const baseUrl = authBaseUrl(event)
  let user
  try {
    user = await requireMcpUser(event, {
      audiences: [`${baseUrl}/api/integrations/merchant-handoff`],
      requiredScopes: ['merchant_handoff'],
      allowSession: false,
    })
  } catch (error) {
    if (statusCode(error) === 401) {
      setResponseHeader(event, 'www-authenticate', `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/merchant-handoff"`)
    }
    throw error
  }

  const context = await getMerchantHandoffOrder(user.db, orderId)
  if (!context) throw new HTTPError({ statusCode: 404, statusMessage: 'Order not found' })
  if (!user.oauthClientId || user.oauthClientId !== context.destination.oauth_client_id) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Order not found' })
  }
  const membership = await resolveOrganizationMembership(user.env, {
    organizationId: context.order.organization_id,
    userId: user.userId,
  })
  if (!membership) throw new HTTPError({ statusCode: 404, statusMessage: 'Order not found' })
  await assertLocationAccess(user.db, {
    env: user.env,
    memberId: membership.memberId,
    role: membership.role,
    organizationId: context.order.organization_id,
    siteId: context.order.site_id,
    locationId: context.order.location_id,
  })
  return { user, ...context }
}
