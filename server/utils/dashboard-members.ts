import { queryAll, type DbClient } from '~/server/db'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { isPhoneInvitationEmail, phoneDigitsFromInvitationEmail } from '~/server/utils/phone-invitations'
import { formatForDisplay } from '~/utils/phone'

export interface DashboardMemberRow {
  id: string
  role: string
  createdAt: string
  userId: string
  name: string
  email: string
  image: string | null
}

export interface DashboardInvitationRow {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: string
  createdAt: string
  inviterName: string | null
  deliveryStatus: string | null
  deliveryError: string | null
  isPhoneInvite: boolean
  phoneDisplay: string | null
}

// Shared by server/api/dashboard/members.get.ts and settings/members.vue's SSR
// branch — see the "Nested SSR self-fetch loses Cloudflare bindings" rule in
// CLAUDE.md for why the page can't just $fetch its own API route during SSR.
export async function getOrganizationMembersData(db: DbClient, organizationId: string): Promise<{
  members: DashboardMemberRow[]
  invitations: DashboardInvitationRow[]
}> {
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
  `, [organizationId])
  const members = memberRows.map(m => ({
    ...m,
    createdAt: betterAuthTimestampToIso(m.createdAt, 'member.createdAt')
  }))

  const invitationRows = await queryAll<{
    id: string; email: string; role: string | null
    status: string; expiresAt: BetterAuthTimestamp; createdAt: BetterAuthTimestamp
    inviterName: string | null
    deliveryStatus: string | null
    deliveryError: string | null
  }>(db, `
    SELECT i.id, i.email, i.role, i.status, i.expiresAt, i.createdAt,
           u.name as inviterName,
           (
             SELECT COALESCE(n.whatsapp_delivery_status, n.status) FROM notifications n
             WHERE n.related_submission_type = 'invitation' AND n.related_submission_id = i.id
             ORDER BY n.created_at DESC LIMIT 1
           ) AS deliveryStatus,
           (
             SELECT COALESCE(n.whatsapp_delivery_error, n.error) FROM notifications n
             WHERE n.related_submission_type = 'invitation' AND n.related_submission_id = i.id
             ORDER BY n.created_at DESC LIMIT 1
           ) AS deliveryError
    FROM invitation i
    LEFT JOIN user u ON u.id = i.inviterId
    WHERE i.organizationId = ? AND i.status = 'pending'
    ORDER BY i.createdAt DESC
  `, [organizationId])
  const invitations = invitationRows.map(i => {
    const digits = phoneDigitsFromInvitationEmail(i.email)
    return {
      ...i,
      expiresAt: betterAuthTimestampToIso(i.expiresAt, 'invitation.expiresAt'),
      createdAt: betterAuthTimestampToIso(i.createdAt, 'invitation.createdAt'),
      isPhoneInvite: isPhoneInvitationEmail(i.email),
      // Masked display phone for WhatsApp/manager invitations — never expose
      // the full number in a list response (mirrors the pre-send disclosure
      // rule used for guest-thread reply confirmations).
      phoneDisplay: digits ? formatForDisplay(`+${digits}`) : null,
    }
  })

  return { members, invitations }
}
