import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const siteId = String(getRouterParam(event, 'siteId') || '').trim()
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })

  const body = await readBody(event).catch(() => ({})) as { email?: string; role?: string; resend?: boolean }
  const email = String(body.email || '').trim().toLowerCase()
  const role = String(body.role || 'admin').trim().toLowerCase()
  const resend = body.resend === true

  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Invalid email' }, { status: 400 })
  }
  if (!['admin', 'member', 'owner'].includes(role)) {
    return jsonResponse({ error: 'Invalid role' }, { status: 400 })
  }

  const site = await queryFirst<{ id: string; subdomain: string; organization_id: string; org_slug: string; org_name: string }>(db, `
    SELECT s.id, s.subdomain, s.organization_id, o.slug AS org_slug, o.name AS org_name
    FROM sites s
    JOIN organization o ON o.id = s.organization_id
    WHERE s.id = ?
    LIMIT 1
  `, [siteId])

  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const existingMember = await queryFirst<{ role: string }>(db, `
    SELECT m.role
    FROM member m
    JOIN user u ON u.id = m.userId
    WHERE m.organizationId = ? AND lower(u.email) = ?
    LIMIT 1
  `, [site.organization_id, email])

  if (existingMember) {
    return jsonResponse({ error: 'User is already a member of this organization', existingRole: existingMember.role }, { status: 409 })
  }

  const existingInvite = await queryFirst<{ id: string; role: string | null }>(db, `
    SELECT id, role
    FROM invitation
    WHERE organizationId = ? AND lower(email) = ? AND status = 'pending'
    ORDER BY createdAt DESC
    LIMIT 1
  `, [site.organization_id, email])

  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  const invitationId = existingInvite?.id ?? crypto.randomUUID()

  if (existingInvite) {
    if (!resend) {
      return jsonResponse({
        success: false,
        reason: 'already_invited',
        invitationId,
        inviteUrl: `${getRequestURL(event).origin}/accept-invitation/${invitationId}`,
        existingRole: existingInvite.role ?? 'member',
      }, { status: 409 })
    }

    await execute(db, `
      UPDATE invitation
      SET role = ?, inviterId = ?, expiresAt = ?, status = 'pending'
      WHERE id = ?
    `, [role, session.user.id, expiresAt, invitationId])
  } else {
    await execute(db, `
      INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [invitationId, site.organization_id, email, role, expiresAt, session.user.id, Math.floor(Date.now() / 1000)])
  }

  return jsonResponse({
    success: true,
    invitationId,
    inviteUrl: `${getRequestURL(event).origin}/accept-invitation/${invitationId}?siteId=${encodeURIComponent(site.id)}`,
    email,
    role,
    organizationId: site.organization_id,
    organizationSlug: site.org_slug,
    organizationName: site.org_name,
    siteId: site.id,
    siteSubdomain: site.subdomain,
    resent: Boolean(existingInvite),
  })
})
