// POST /api/admin/invite/client — create org for a new restaurant client + invitation link,
// or (when `orgId`/`orgSlug` is given) attach an owner invitation to an org that already
// exists — e.g. one created by `client:import --apply`, which provisions organization/sites/
// site_domains but never an owner user/member/invitation.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { execute, executeBatch, queryFirst } from '~/server/db'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const body = await readBody(event).catch(() => ({})) as {
    email?: string
    restaurantName?: string
    orgId?: string
    orgSlug?: string
  }
  const email = body.email?.trim().toLowerCase()
  const restaurantName = body.restaurantName?.trim()
  const existingOrgId = body.orgId?.trim()
  const existingOrgSlug = body.orgSlug?.trim()
  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 7 * 24 * 60 * 60
  const invitationId = crypto.randomUUID()

  // Attach-to-existing-org path: org already provisioned (e.g. client:import --apply),
  // it just has no owner yet. Skip org creation entirely — only insert the invitation.
  if (existingOrgId || existingOrgSlug) {
    const org = await queryFirst<{ id: string; name: string; slug: string | null }>(
      db,
      existingOrgId
        ? 'SELECT id, name, slug FROM organization WHERE id = ? LIMIT 1'
        : 'SELECT id, name, slug FROM organization WHERE slug = ? LIMIT 1',
      [existingOrgId || existingOrgSlug],
    )
    if (!org) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

    // Prevent creating a duplicate/conflicting owner: if the org already has an owner
    // member, this endpoint is not a re-invite/transfer flow — fail loudly instead.
    const existingOwner = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM member WHERE organizationId = ? AND role = 'owner' LIMIT 1`,
      [org.id],
    )
    if (existingOwner) {
      return jsonResponse({ error: 'Organization already has an owner' }, { status: 409 })
    }

    // Check if there's already a pending owner invitation for this organization
    const existingPendingInvitation = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM invitation WHERE organizationId = ? AND role = 'owner' AND status = 'pending' LIMIT 1`,
      [org.id],
    )
    if (existingPendingInvitation) {
      return jsonResponse({ error: 'Organization already has a pending owner invitation' }, { status: 409 })
    }

    try {
      await execute(db, `
        INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
        VALUES (?, ?, ?, 'owner', 'pending', ?, ?, ?)
      `, [invitationId, org.id, email, expiresAt, session.user.id, now])
    } catch (error) {
      // Handle concurrent requests that hit the unique constraint
      const message = error instanceof Error ? error.message : String(error || '')
      if (/UNIQUE constraint failed/i.test(message)) {
        return jsonResponse({ error: 'Organization already has a pending owner invitation' }, { status: 409 })
      }
      throw error
    }

    const origin = getRequestURL(event).origin
    const inviteUrl = `${origin}/accept-invitation/${invitationId}`

    return jsonResponse({
      success: true,
      orgId: org.id,
      orgSlug: org.slug,
      inviteUrl,
      email,
      restaurantName: restaurantName || org.name,
    })
  }

  // Net-new-client path: create org + invitation together (unchanged behavior).
  if (!restaurantName) return jsonResponse({ error: 'Restaurant name is required' }, { status: 400 })

  // Find a unique slug
  const baseSlug = slugify(restaurantName)
  if (!baseSlug) return jsonResponse({ error: 'Restaurant name must include letters or numbers' }, { status: 400 })

  let orgSlug = baseSlug
  let i = 1
  while (true) {
    const conflict = await queryFirst(db, 'SELECT id FROM organization WHERE slug = ? LIMIT 1', [orgSlug])
    if (!conflict) break

    if (i <= 10) {
      orgSlug = `${baseSlug}-${i}`
    } else {
      const shortId = crypto.randomUUID().slice(0, 8)
      orgSlug = `${baseSlug}-${shortId}`
    }
    i++
  }

  const orgId = crypto.randomUUID()

  // Atomic: an invitation without its organization (or vice versa) is orphaned state.
  await executeBatch(db, [
    {
      query: `INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)`,
      params: [orgId, restaurantName, orgSlug, now],
    },
    {
      query: `
        INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
        VALUES (?, ?, ?, 'owner', 'pending', ?, ?, ?)
      `,
      params: [invitationId, orgId, email, expiresAt, session.user.id, now],
    },
  ])

  const origin = getRequestURL(event).origin
  const inviteUrl = `${origin}/accept-invitation/${invitationId}`

  return jsonResponse({ success: true, orgId, orgSlug, inviteUrl, email, restaurantName })
})
