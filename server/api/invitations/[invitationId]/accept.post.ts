import { appendResponseHeader, getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst } from '~/server/db'

interface AcceptInvitationApi {
  acceptInvitation(_input: {
    body: { invitationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

function buildRedirectUrl(params: {
  orgSlug: string
  preferredSite: {
    id: string
    subdomain: string | null
    onboarding_status: string | null
  } | null
  fallbackSites: Array<{
    id: string
    subdomain: string | null
    onboarding_status: string | null
  }>
}): string {
  const orgBase = `/dashboard/${encodeURIComponent(params.orgSlug)}`

  const site = params.preferredSite
  if (site) {
    if (site.onboarding_status !== 'active') return `${orgBase}/~/onboarding`
    if (site.subdomain) return `${orgBase}/sites/${encodeURIComponent(site.subdomain)}`
  }

  if (params.fallbackSites.length === 1) {
    const onlySite = params.fallbackSites[0]!
    if (onlySite.onboarding_status !== 'active') return `${orgBase}/~/onboarding`
    if (onlySite.subdomain) return `${orgBase}/sites/${encodeURIComponent(onlySite.subdomain)}`
  }

  return orgBase
}

export default defineEventHandler(async (event) => {
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()
  if (!invitationId) return jsonResponse({ error: 'Invitation id is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const preferredSiteId = typeof getQuery(event).siteId === 'string' ? String(getQuery(event).siteId).trim() : ''

  const invitation = await queryFirst<{
    id: string
    organizationId: string
    email: string
    role: string | null
    status: string
    expiresAt: number
    organizationSlug: string | null
  }>(db, `
    SELECT i.id, i.organizationId, i.email, i.role, i.status, i.expiresAt, o.slug AS organizationSlug
    FROM invitation i
    JOIN organization o ON o.id = i.organizationId
    WHERE i.id = ?
    LIMIT 1
  `, [invitationId])

  if (!invitation) return jsonResponse({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'pending') {
    return jsonResponse({ error: `Invitation is already ${invitation.status}` }, { status: 410 })
  }
  if (invitation.expiresAt < Math.floor(Date.now() / 1000)) {
    return jsonResponse({ error: 'Invitation has expired' }, { status: 410 })
  }
  if ((session.user.email ?? '').toLowerCase() !== invitation.email.toLowerCase()) {
    return jsonResponse({ error: `This invitation was sent to ${invitation.email}. Please sign in with that account.` }, { status: 403 })
  }

  const auth = createAuth(env)
  const acceptApi = auth.api as unknown as AcceptInvitationApi

  let response: Response
  try {
    response = await acceptApi.acceptInvitation({
      body: { invitationId },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown network error')
    console.error('accept_invitation_request_failed', {
      invitationId,
      userId: session.user.id,
      error: normalizedError.message,
    })
    return jsonResponse({ error: 'Failed to accept invitation' }, { status: 502 })
  }

  if (!response.ok) {
    let message = 'Failed to accept invitation'
    try {
      const data = await response.json() as { message?: string; error?: string }
      message = data.message || data.error || message
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    return jsonResponse({ error: message }, { status: response.status || 500 })
  }

  const headerBag = response.headers as Headers & {
    getSetCookie?: () => string[]
    getAll?: (_name: string) => string[]
    raw?: () => Record<string, string[]>
  }
  const setCookies = typeof headerBag.getSetCookie === 'function'
    ? headerBag.getSetCookie()
    : typeof headerBag.getAll === 'function'
      ? headerBag.getAll('set-cookie')
      : (headerBag.raw?.()['set-cookie'] || [])

  for (const cookieValue of setCookies) {
    appendResponseHeader(event, 'set-cookie', cookieValue)
  }

  const orgSites = await queryAll<{
    id: string
    subdomain: string | null
    onboarding_status: string | null
  }>(db, `
    SELECT id, subdomain, onboarding_status
    FROM sites
    WHERE organization_id = ?
    ORDER BY created_at ASC
  `, [invitation.organizationId])

  const preferredSite = preferredSiteId
    ? orgSites.find(site => site.id === preferredSiteId) ?? null
    : null

  const redirectTo = buildRedirectUrl({
    orgSlug: invitation.organizationSlug || invitation.organizationId,
    preferredSite,
    fallbackSites: orgSites,
  })

  return jsonResponse({
    success: true,
    redirectTo,
    organizationId: invitation.organizationId,
    role: invitation.role ?? 'member',
  })
})
