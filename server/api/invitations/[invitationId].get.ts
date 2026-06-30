import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const invitationId = String(getRouterParam(event, 'invitationId') || '').trim()
  if (!invitationId) return jsonResponse({ error: 'Invitation id is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const preferredSiteId = typeof getQuery(event).siteId === 'string' ? String(getQuery(event).siteId).trim() : ''

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
