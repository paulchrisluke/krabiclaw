import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryAll, queryFirst } from '~/server/db'
import { buildInvitationRedirectUrl, sanitizeInvitationReturnTo } from '~/server/utils/invitations'

export default defineEventHandler(async (event) => {
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()
  if (!invitationId) return jsonResponse({ error: 'Invitation id is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const query = getQuery(event)
  const preferredSiteId = typeof query.siteId === 'string' ? String(query.siteId).trim() : ''
  const requestedReturnTo = typeof query.returnTo === 'string' ? query.returnTo : ''

  const invitation = await queryFirst<{
    id: string
    organizationId: string
    email: string
    role: string | null
    status: string
    expiresAt: number
    organizationName: string
    organizationSlug: string | null
    inviterName: string | null
    inviterEmail: string | null
  }>(db, `
    SELECT i.id, i.organizationId, i.email, i.role, i.status, i.expiresAt,
           o.name AS organizationName, o.slug AS organizationSlug,
           u.name AS inviterName, u.email AS inviterEmail
    FROM invitation i
    JOIN organization o ON o.id = i.organizationId
    LEFT JOIN user u ON u.id = i.inviterId
    WHERE i.id = ?
    LIMIT 1
  `, [invitationId])

  if (!invitation) return jsonResponse({ error: 'Invitation not found' }, { status: 404 })

  const orgSlug = invitation.organizationSlug || invitation.organizationId

  // Idempotent re-visit: a manager who already accepted (e.g. re-opening a
  // WhatsApp deep link, or the OTP-verify reload landing here after a
  // "Join" click already completed) should be routed straight back to their
  // destination instead of hitting a raw "invitation unavailable" error.
  if (invitation.status === 'accepted') {
    const session = await getAuthSession(event, env).catch(() => null)
    const isAcceptedSession = session?.user?.id
      ? Boolean(await queryFirst<{ id: string }>(db, `
          SELECT id FROM member WHERE organizationId = ? AND userId = ? LIMIT 1
        `, [invitation.organizationId, session.user.id]))
      : false

    if (isAcceptedSession) {
      const sanitizedReturnTo = sanitizeInvitationReturnTo(requestedReturnTo, orgSlug)
      let redirectTo = sanitizedReturnTo
      if (!redirectTo) {
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
        const preferredSite = preferredSiteId ? orgSites.find(site => site.id === preferredSiteId) ?? null : null
        redirectTo = buildInvitationRedirectUrl({ orgSlug, preferredSite, fallbackSites: orgSites })
      }
      return jsonResponse({ status: 'accepted', redirectTo, organization: { id: invitation.organizationId, slug: invitation.organizationSlug } })
    }
    return jsonResponse({ error: 'Invitation is already accepted. Please sign in with the account that accepted it.' }, { status: 410 })
  }
  if (invitation.status !== 'pending') {
    return jsonResponse({ error: `Invitation is already ${invitation.status}` }, { status: 410 })
  }
  if (invitation.expiresAt < Math.floor(Date.now() / 1000)) {
    return jsonResponse({ error: 'Invitation has expired' }, { status: 410 })
  }

  const orgSites = await queryAll<{
    id: string
    subdomain: string | null
    brand_name: string | null
    status: string | null
    onboarding_status: string | null
  }>(db, `
    SELECT id, subdomain, brand_name, status, onboarding_status
    FROM sites
    WHERE organization_id = ?
    ORDER BY created_at ASC
  `, [invitation.organizationId])

  const preferredSite = preferredSiteId
    ? orgSites.find(site => site.id === preferredSiteId) ?? null
    : null

  const resolvedSite = preferredSite ?? (orgSites.length === 1 ? orgSites[0]! : null)

  return jsonResponse({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role ?? 'member',
    expiresAt: new Date(invitation.expiresAt * 1000).toISOString(),
    organization: {
      id: invitation.organizationId,
      name: invitation.organizationName,
      slug: invitation.organizationSlug,
    },
    inviter: {
      name: invitation.inviterName,
      email: invitation.inviterEmail,
    },
    site: resolvedSite ? {
      id: resolvedSite.id,
      subdomain: resolvedSite.subdomain,
      brandName: resolvedSite.brand_name,
      status: resolvedSite.status,
      onboardingStatus: resolvedSite.onboarding_status,
    } : null,
    siteCount: orgSites.length,
    preferredSiteRequested: Boolean(preferredSiteId),
  })
})
