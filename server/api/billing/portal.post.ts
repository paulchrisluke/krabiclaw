import { toWebRequest } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession, type CloudflareEnv } from '~/server/utils/auth'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organizationId?: string; returnUrl?: string }>(event)
  if (!body?.organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const env = cloudflareEnv(event) as CloudflareEnv
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw createError({ statusCode: 503, statusMessage: 'Stripe not configured' })
  }
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, {
    explicitOrganizationId: body.organizationId,
  })
  if (!organization) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  const request = toWebRequest(event)
  const target = new URL(request.url)
  target.pathname = '/api/auth/subscription/billing-portal'
  target.search = ''
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  return await createAuth(env).handler(new Request(target, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      referenceId: organization.id,
      customerType: 'organization',
      returnUrl: body.returnUrl ?? `${getRequestURL(event).origin}/dashboard/${encodeURIComponent(organization.slug)}/settings/billing`,
    }),
  }))
})
