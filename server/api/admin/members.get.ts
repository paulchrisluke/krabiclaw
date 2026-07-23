// GET /api/admin/members - platform team (admins) + pending client invitations
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll } from '~/server/db'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { adminHeadersForEvent, authAdminApi, listPlatformAdminUsers } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const [team, pendingInvitationRows] = await Promise.all([
      listPlatformAdminUsers(authAdminApi(env), adminHeadersForEvent(event)),
      queryAll<{
        id: string; email: string; role: string | null; status: string
        expiresAt: BetterAuthTimestamp; createdAt: BetterAuthTimestamp
        orgName: string | null; orgSlug: string | null
      }>(db, `
        SELECT i.id, i.email, i.role, i.status, i.expiresAt, i.createdAt,
               o.name as orgName, o.slug as orgSlug
        FROM invitation i
        LEFT JOIN organization o ON i.organizationId = o.id
        WHERE i.status = 'pending'
        ORDER BY i.createdAt DESC
        LIMIT 50
      `),
    ])

    const pendingInvitations = pendingInvitationRows.map(i => ({
      ...i,
      expiresAt: betterAuthTimestampToIso(i.expiresAt, 'invitation.expiresAt'),
      createdAt: betterAuthTimestampToIso(i.createdAt, 'invitation.createdAt')
    }))

    return jsonResponse({
      team,
      pendingInvitations,
    })
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500
    const message = typeof (error as { statusMessage?: unknown })?.statusMessage === 'string' ? (error as { statusMessage: string }).statusMessage : 'Failed to fetch members'
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
