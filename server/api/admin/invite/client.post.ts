// POST /api/admin/invite/client — create org for a new restaurant client + invitation link
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { executeBatch, queryFirst } from '~/server/db'

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

  const body = await readBody(event).catch(() => ({})) as { email?: string; restaurantName?: string }
  const email = body.email?.trim().toLowerCase()
  const restaurantName = body.restaurantName?.trim()
  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })
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
  const invitationId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 7 * 24 * 60 * 60

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
