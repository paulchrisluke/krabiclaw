import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { queryAll } from '~/server/db'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  const memberRows = await queryAll<{
    id: string; role: string; createdAt: BetterAuthTimestamp
    userId: string; name: string; email: string; image: string | null
  }>(db, `
    SELECT m.id, m.role, m.createdAt,
           u.id as userId, u.name, u.email, u.image
    FROM member m
    JOIN user u ON u.id = m.userId
    WHERE m.organizationId = ?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name ASC
  `, [organization.id])
  const members = memberRows.map(m => ({
    ...m,
    createdAt: betterAuthTimestampToIso(m.createdAt, 'member.createdAt')
  }))

  const invitationRows = await queryAll<{
    id: string; email: string; role: string | null
    status: string; expiresAt: BetterAuthTimestamp; createdAt: BetterAuthTimestamp
    inviterName: string | null
  }>(db, `
    SELECT i.id, i.email, i.role, i.status, i.expiresAt, i.createdAt,
           u.name as inviterName
    FROM invitation i
    LEFT JOIN user u ON u.id = i.inviterId
    WHERE i.organizationId = ? AND i.status = 'pending'
    ORDER BY i.createdAt DESC
  `, [organization.id])
  const invitations = invitationRows.map(i => ({
    ...i,
    expiresAt: betterAuthTimestampToIso(i.expiresAt, 'invitation.expiresAt'),
    createdAt: betterAuthTimestampToIso(i.createdAt, 'invitation.createdAt')
  }))

  return jsonResponse({
    members,
    invitations,
  })
})
