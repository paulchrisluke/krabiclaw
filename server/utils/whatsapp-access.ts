import { execute, queryFirst, type DbClient } from '~/server/db'
import { isOperationalRole, isOrganizationWideRole, LOCATION_MANAGER_ROLE } from '~/server/utils/member-access'
import { normalizePhone } from '~/server/utils/whatsapp'

export interface WhatsAppAccessTarget {
  organizationId: string
  siteId: string
  locationId: string | null
  phone: string
  inviterUserId?: string | null
}

export interface WhatsAppAccessResult {
  status: 'active' | 'invitation_pending'
  normalizedPhone: string
  memberId?: string
  invitationId?: string
  createdInvitation?: boolean
}

export function phoneTemporaryEmail(phone: string): string {
  return `phone-${normalizePhone(phone).replace(/\D/g, '')}@phone.krabiclaw.local`
}

export async function ensureWhatsAppRecipientAccess(db: DbClient, target: WhatsAppAccessTarget): Promise<WhatsAppAccessResult> {
  const normalizedPhone = normalizePhone(target.phone)
  const existing = await queryFirst<{ userId: string; email: string; memberId: string | null; role: string | null }>(db, `
    SELECT u.id AS userId, u.email, m.id AS memberId, m.role
    FROM user u
    LEFT JOIN member m ON m.userId = u.id AND m.organizationId = ?
    WHERE u.phoneNumber = ? AND u.phoneNumberVerified = 1
    LIMIT 1
  `, [target.organizationId, normalizedPhone])

  if (existing?.memberId && existing.role) {
    const role = existing.role === 'member' ? LOCATION_MANAGER_ROLE : existing.role
    if (!isOperationalRole(role)) throw new Error(`Existing member role ${existing.role} cannot receive operational notifications`)
    if (role !== existing.role) {
      await execute(db, `UPDATE member SET role = ? WHERE id = ?`, [role, existing.memberId])
    }
    if (!isOrganizationWideRole(existing.role)) {
      await execute(db, `
        INSERT OR IGNORE INTO member_access_scope (id, member_id, organization_id, site_id, location_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [crypto.randomUUID(), existing.memberId, target.organizationId, target.siteId, target.locationId, new Date().toISOString()])
    }
    return { status: 'active', normalizedPhone, memberId: existing.memberId }
  }

  const inviter = target.inviterUserId
    ? { id: target.inviterUserId }
    : await queryFirst<{ id: string }>(db, `
        SELECT userId AS id FROM member
        WHERE organizationId = ? AND role IN ('owner', 'admin')
        ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, createdAt ASC LIMIT 1
      `, [target.organizationId])
  if (!inviter) throw new Error('An owner or admin is required to invite the WhatsApp recipient')

  const email = existing?.email || phoneTemporaryEmail(normalizedPhone)
  let invitation = await queryFirst<{ id: string }>(db, `
    SELECT id FROM invitation
    WHERE organizationId = ? AND lower(email) = lower(?) AND status = 'pending' AND expiresAt > unixepoch()
    ORDER BY createdAt DESC LIMIT 1
  `, [target.organizationId, email])
  let createdInvitation = false
  if (!invitation) {
    invitation = { id: crypto.randomUUID() }
    await execute(db, `
      INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
      VALUES (?, ?, ?, 'location_manager', 'pending', ?, ?, ?)
    `, [invitation.id, target.organizationId, email, Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, inviter.id, Math.floor(Date.now() / 1000)])
    createdInvitation = true
  }
  await execute(db, `
    INSERT OR IGNORE INTO invitation_access_scope (id, invitation_id, organization_id, site_id, location_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), invitation.id, target.organizationId, target.siteId, target.locationId, new Date().toISOString()])

  return { status: 'invitation_pending', normalizedPhone, invitationId: invitation.id, createdInvitation }
}
