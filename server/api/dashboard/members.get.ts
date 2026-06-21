import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  const members = await db.prepare(`
    SELECT m.id, m.role, m.createdAt,
           u.id as userId, u.name, u.email, u.image
    FROM member m
    JOIN user u ON u.id = m.userId
    WHERE m.organizationId = ?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name ASC
  `).bind(organization.id).all<{
    id: string; role: string; createdAt: string
    userId: string; name: string; email: string; image: string | null
  }>()

  const invitations = await db.prepare(`
    SELECT i.id, i.email, i.role, i.status, i.expiresAt, i.createdAt,
           u.name as inviterName
    FROM invitation i
    LEFT JOIN user u ON u.id = i.inviterId
    WHERE i.organizationId = ? AND i.status = 'pending'
    ORDER BY i.createdAt DESC
  `).bind(organization.id).all<{
    id: string; email: string; role: string | null
    status: string; expiresAt: string; createdAt: string
    inviterName: string | null
  }>()

  return jsonResponse({
    members: members.results ?? [],
    invitations: invitations.results ?? [],
  })
})
