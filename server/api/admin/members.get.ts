// GET /api/admin/members — platform team (admins) + pending client invitations
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryAll } from '~/server/db'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const [teamRows, pendingInvitationRows] = await Promise.all([
    queryAll<{ id: string; name: string | null; email: string; image: string | null; role: string; createdAt: BetterAuthTimestamp }>(db, `
      SELECT id, name, email, image, role, createdAt
      FROM user
      WHERE role = 'admin'
      ORDER BY createdAt ASC
    `),

    queryAll<{
      id: string; email: string; role: string | null; status: string
      expiresAt: BetterAuthTimestamp; createdAt: BetterAuthTimestamp
      orgName: string | null; orgSlug: string | null; inviterName: string | null
    }>(db, `
      SELECT i.id, i.email, i.role, i.status, i.expiresAt, i.createdAt,
             o.name as orgName, o.slug as orgSlug,
             u.name as inviterName
      FROM invitation i
      LEFT JOIN organization o ON i.organizationId = o.id
      LEFT JOIN user u ON i.inviterId = u.id
      WHERE i.status = 'pending'
      ORDER BY i.createdAt DESC
      LIMIT 50
    `),
  ])

  const team = teamRows.map(u => ({
    ...u,
    createdAt: betterAuthTimestampToIso(u.createdAt, 'user.createdAt')
  }))
  const pendingInvitations = pendingInvitationRows.map(i => ({
    ...i,
    expiresAt: betterAuthTimestampToIso(i.expiresAt, 'invitation.expiresAt'),
    createdAt: betterAuthTimestampToIso(i.createdAt, 'invitation.createdAt')
  }))

  return jsonResponse({
    team,
    pendingInvitations,
  })
})
