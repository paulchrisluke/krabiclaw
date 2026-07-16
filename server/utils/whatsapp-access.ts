import { execute, queryFirst, type DbClient } from '~/server/db'
import { isOperationalRole, isOrganizationWideRole, LOCATION_MANAGER_ROLE } from '~/server/utils/member-access'
import { normalizePhone, sendWhatsAppNotification } from '~/server/utils/whatsapp'

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
  shouldDeliverInvitation?: boolean
}

export async function sendWhatsAppAccessInvitation(
  env: { WHATSAPP_PHONE_NUMBER_ID?: string; WHATSAPP_ACCESS_TOKEN?: string; WHATSAPP_DELIVERY_MODE?: string },
  db: DbClient,
  target: Pick<WhatsAppAccessTarget, 'organizationId' | 'siteId' | 'locationId' | 'phone'> & { invitationId: string },
): Promise<void> {
  const site = await queryFirst<{ name: string }>(db, `
    SELECT coalesce(s.brand_name, o.name) AS name
    FROM sites s JOIN organization o ON o.id = s.organization_id
    WHERE s.id = ? AND s.organization_id = ? LIMIT 1
  `, [target.siteId, target.organizationId])
  const invitationPath = `${encodeURIComponent(target.invitationId)}?siteId=${encodeURIComponent(target.siteId)}`
  const result = await sendWhatsAppNotification(env, db, {
    organizationId: target.organizationId,
    siteId: target.siteId,
    locationId: target.locationId,
    toPhone: target.phone,
    template: 'dashboard_access_invitation',
    vars: { site_name: site?.name || 'your site', invitation_path: invitationPath },
  })
  if (!result.success) throw new Error(result.error || 'Failed to send WhatsApp access invitation')
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
    if (!isOperationalRole(existing.role)) {
      throw createError({ statusCode: 409, statusMessage: `Existing member role ${existing.role} cannot receive operational notifications` })
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
  let invitation = await queryFirst<{ id: string; expiresAt: number; role: string | null }>(db, `
    SELECT id, expiresAt, role FROM invitation
    WHERE organizationId = ? AND lower(email) = lower(?) AND status = 'pending'
    ORDER BY createdAt DESC LIMIT 1
  `, [target.organizationId, email])
  if (invitation && invitation.role !== LOCATION_MANAGER_ROLE) {
    throw new Error(`Pending invitation role ${invitation.role || 'unset'} is not compatible with operational access`)
  }
  let shouldDeliverInvitation = false
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  if (!invitation) {
    const invitationId = crypto.randomUUID()
    await execute(db, `
      INSERT OR IGNORE INTO invitation (id, organizationId, email, role, status, expiresAt, inviterId, createdAt)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [invitationId, target.organizationId, email, LOCATION_MANAGER_ROLE, expiresAt, inviter.id, Math.floor(Date.now() / 1000)])
    invitation = await queryFirst<{ id: string; expiresAt: number; role: string | null }>(db, `
      SELECT id, expiresAt, role FROM invitation
      WHERE organizationId = ? AND lower(email) = lower(?) AND status = 'pending'
      ORDER BY createdAt DESC LIMIT 1
    `, [target.organizationId, email])
    if (!invitation) throw new Error('Failed to create or reuse WhatsApp access invitation')
    if (invitation.role !== LOCATION_MANAGER_ROLE) {
      throw new Error(`Pending invitation role ${invitation.role || 'unset'} is not compatible with operational access`)
    }
    shouldDeliverInvitation = invitation.id === invitationId
  }
  if (invitation.expiresAt <= Math.floor(Date.now() / 1000)) {
    await execute(db, `UPDATE invitation SET expiresAt = ? WHERE id = ?`, [expiresAt, invitation.id])
    shouldDeliverInvitation = true
  }
  await execute(db, `
    INSERT OR IGNORE INTO invitation_access_scope (id, invitation_id, organization_id, site_id, location_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [crypto.randomUUID(), invitation.id, target.organizationId, target.siteId, target.locationId, new Date().toISOString()])

  return { status: 'invitation_pending', normalizedPhone, invitationId: invitation.id, shouldDeliverInvitation }
}
