import {
  createCustomDomainPair,
  deleteCustomDomain,
  type DomainEnv,
} from '~/server/utils/domains'
import { rootDomainForPair } from '~/server/utils/domain-shared'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { notifySiteTransferReminder } from '~/server/utils/site-transfer-notifications'
import { normalizeHost } from '~/server/utils/tenant-hosts'

// Tables with (organization_id, site_id) that need re-parenting when a site transfers orgs.
// Excludes billing/credits tables (organization_billing, organization_entitlements, ai_credits,
// ai_usage_log, stripe_webhook_events) — those stay with the originating org.
const SITE_SCOPED_TABLES = [
  'site_domains',
  'site_domain_events',
  'google_business_connections',
  'google_analytics_connections',
  'business_locations',
  'google_business_events',
  'facebook_pages_connections',
  'site_content',
  'site_config',
  'site_locales',
  'site_content_translations',
  'menu_translations',
  'menu_item_translations',
  'business_location_translations',
  'post_translations',
  'translation_jobs',
  'translation_job_items',
  'media_assets',
  'menus',
  'reviews',
  'posts',
  'contact_submissions',
  'reservation_submissions',
  'notifications',
  'chowbot_conversations',
  'chowbot_messages',
  'location_qa',
  'booking_policies',
  'experiences',
  'experience_bookings',
  'site_billing',
  'site_entitlements',
] as const

const DAY_MS = 24 * 60 * 60 * 1000
const REMINDER_THRESHOLDS_DAYS = [1, 3, 7] as const
const DOMAIN_PAUSE_AFTER_DAYS = 30

type SiteTransferEnv = DomainEnv & {
  PLATFORM_OWNER_EMAILS?: string
  RESEND_API_KEY?: string
}

export interface TransferDomainSnapshot {
  domain: string
  include_www: boolean
}

interface TransferCleanupRow {
  id: string
  site_id: string
  from_organization_id: string
  status: string
  requires_payment: number
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
}

interface TransferCompletionRow {
  id: string
  site_id: string
  from_organization_id: string
  status: string
  claiming_user_id: string | null
  claiming_organization_id: string | null
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
  payment_completed_at: string | null
}

interface TransferReminderRow {
  id: string
  site_id: string
  from_organization_id: string
  to_email: string
  token: string
  created_at: string
  invited_plan: string | null
  invited_domain: string | null
  reminder_count: number | null
  requires_payment: number
  custom_domains_snapshot: string | null
  custom_domains_removed_at: string | null
  site_name: string | null
}

export function serializeTransferDomainSnapshot(snapshot: TransferDomainSnapshot[]): string {
  return JSON.stringify(snapshot)
}

export function parseTransferDomainSnapshot(raw: string | null | undefined): TransferDomainSnapshot[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Array<{ domain?: string; include_www?: boolean }>
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => ({
        domain: typeof entry?.domain === 'string' ? rootDomainForPair(entry.domain) : '',
        include_www: entry?.include_www !== false,
      }))
      .filter((entry) => entry.domain)
  } catch {
    return []
  }
}

export async function buildTransferDomainSnapshot(db: D1Database, siteId: string): Promise<TransferDomainSnapshot[]> {
  const rows = await queryAll<{ domain: string }>(db, `
    SELECT domain
    FROM site_domains
    WHERE site_id = ? AND type = 'custom' AND status != 'deleted'
    ORDER BY created_at ASC
  `, [siteId])

  const byRoot = new Map<string, { hasRoot: boolean; hasWww: boolean }>()

  for (const row of rows || []) {
    const domain = String(row.domain || '').trim().toLowerCase()
    if (!domain) continue
    const root = rootDomainForPair(domain)
    const current = byRoot.get(root) ?? { hasRoot: false, hasWww: false }
    if (domain === root) current.hasRoot = true
    if (domain === `www.${root}`) current.hasWww = true
    byRoot.set(root, current)
  }

  return Array.from(byRoot.entries()).map(([domain, flags]) => ({
    domain,
    include_www: flags.hasWww || !flags.hasRoot,
  }))
}

export async function deleteSiteCustomDomains(
  env: SiteTransferEnv,
  db: D1Database,
  siteId: string,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null,
): Promise<{ deletedCount: number; failedDomainIds: string[] }> {
  const domains = await queryAll<{ id: string }>(db, `
    SELECT id
    FROM site_domains
    WHERE site_id = ? AND type = 'custom' AND status != 'deleted'
    ORDER BY created_at ASC
  `, [siteId])

  let deletedCount = 0
  const failedDomainIds: string[] = []

  for (const domain of domains || []) {
    try {
      await deleteCustomDomain(env, db, domain.id, actorType, actorId)
      deletedCount += 1
    } catch (error) {
      failedDomainIds.push(domain.id)
      console.error('delete_site_custom_domain_failed', {
        siteId,
        domainId: domain.id,
        actorType,
        actorId,
        error,
      })
    }
  }

  return { deletedCount, failedDomainIds }
}

export async function restoreSiteCustomDomains(
  env: SiteTransferEnv,
  db: D1Database,
  siteId: string,
  organizationId: string,
  snapshotRaw: string | null | undefined,
  actorType: 'owner' | 'admin' | 'system',
  actorId?: string | null,
): Promise<number> {
  const snapshot = parseTransferDomainSnapshot(snapshotRaw)
  let restored = 0

  for (const entry of snapshot) {
    await createCustomDomainPair(env, db, {
      siteId,
      organizationId,
      domain: entry.domain,
      includeWww: entry.include_www,
      actorType: actorType === 'system' ? 'admin' : actorType,
      actorId,
    })
    restored += 1
  }

  return restored
}

export async function reassignSiteOwnership(
  db: D1Database,
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
): Promise<void> {
  const now = new Date().toISOString()

  const batch: BatchQuery[] = SITE_SCOPED_TABLES.map((table) => ({
    query: `UPDATE ${table} SET organization_id = ? WHERE site_id = ? AND organization_id = ?`,
    params: [toOrgId, siteId, fromOrgId],
  }))

  // post_channel_jobs has organization_id but no site_id — update via post join
  batch.push({
    query: `UPDATE post_channel_jobs SET organization_id = ?
         WHERE organization_id = ? AND post_id IN (SELECT id FROM posts WHERE site_id = ?)`,
    params: [toOrgId, fromOrgId, siteId],
  })

  // sites itself — update last so the FK is still valid during the batch
  batch.push({
    query: `UPDATE sites SET organization_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
    params: [toOrgId, now, siteId, fromOrgId],
  })

  await executeBatch(db, batch)
}

export async function executeSiteTransfer(
  db: D1Database,
  siteId: string,
  fromOrgId: string,
  toOrgId: string,
  transferId: string,
  acceptedByUserId: string,
): Promise<void> {
  const now = new Date().toISOString()

  const batch: BatchQuery[] = []

  batch.push(
    ...SITE_SCOPED_TABLES.map((table) => ({
      query: `UPDATE ${table} SET organization_id = ? WHERE site_id = ? AND organization_id = ?`,
      params: [toOrgId, siteId, fromOrgId],
    })),
  )

  batch.push({
    query: `UPDATE post_channel_jobs SET organization_id = ?
         WHERE organization_id = ? AND post_id IN (SELECT id FROM posts WHERE site_id = ?)`,
    params: [toOrgId, fromOrgId, siteId],
  })

  batch.push({
    query: `UPDATE sites SET organization_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?`,
    params: [toOrgId, now, siteId, fromOrgId],
  })

  // mark the transfer request complete
  batch.push({
    query: `UPDATE site_transfer_requests
         SET status = 'accepted', accepted_by_user_id = ?, completed_at = ?
         WHERE id = ?`,
    params: [acceptedByUserId, now, transferId],
  })

  await executeBatch(db, batch)
}

export async function cancelPendingSiteTransfer(
  env: SiteTransferEnv,
  db: D1Database,
  transferId: string,
): Promise<{ cancelled: boolean; customDomainsDeleted: number }> {
  const transfer = await queryFirst<TransferCleanupRow>(db, `
    SELECT id, site_id, from_organization_id, status, requires_payment,
           custom_domains_snapshot, custom_domains_removed_at
    FROM site_transfer_requests
    WHERE id = ?
    LIMIT 1
  `, [transferId])

  if (!transfer || transfer.status !== 'pending') {
    return { cancelled: false, customDomainsDeleted: 0 }
  }

  let snapshotRaw = transfer.custom_domains_snapshot
  let customDomainsDeleted = 0

  if (transfer.requires_payment) {
    if (!snapshotRaw) {
      snapshotRaw = serializeTransferDomainSnapshot(await buildTransferDomainSnapshot(db, transfer.site_id))
    }
    if (transfer.custom_domains_removed_at) {
      customDomainsDeleted = (await restoreSiteCustomDomains(
        env,
        db,
        transfer.site_id,
        transfer.from_organization_id,
        snapshotRaw,
        'system',
      ))
    }
  }

  await execute(db, `
    UPDATE site_transfer_requests
    SET status = 'cancelled',
        custom_domains_snapshot = ?,
        custom_domains_removed_at = NULL
    WHERE id = ?
  `, [snapshotRaw ?? null, transferId])

  return { cancelled: true, customDomainsDeleted }
}

export async function completePaidSiteTransfer(
  env: SiteTransferEnv,
  db: D1Database,
  transferId: string,
): Promise<{ completed: boolean; restoredDomains: number }> {
  const transfer = await queryFirst<TransferCompletionRow>(db, `
    SELECT id, site_id, from_organization_id, status,
           claiming_user_id, claiming_organization_id,
           custom_domains_snapshot, custom_domains_removed_at, payment_completed_at
    FROM site_transfer_requests
    WHERE id = ?
    LIMIT 1
  `, [transferId])

  if (!transfer) {
    return { completed: false, restoredDomains: 0 }
  }

  if (!transfer.claiming_user_id || !transfer.claiming_organization_id) {
    throw new Error('Transfer is missing claiming user or organization')
  }

  if (transfer.status === 'pending') {
    await executeSiteTransfer(
      db,
      transfer.site_id,
      transfer.from_organization_id,
      transfer.claiming_organization_id,
      transfer.id,
      transfer.claiming_user_id,
    )
  } else if (transfer.status !== 'accepted' || transfer.payment_completed_at) {
    return { completed: false, restoredDomains: 0 }
  }

  let restoredDomains = 0
  if (transfer.custom_domains_removed_at && transfer.custom_domains_snapshot) {
    restoredDomains = await restoreSiteCustomDomains(
      env,
      db,
      transfer.site_id,
      transfer.claiming_organization_id,
      transfer.custom_domains_snapshot,
      'system',
      transfer.claiming_user_id,
    )
  }

  await execute(db, `
    UPDATE site_transfer_requests
    SET payment_completed_at = ?,
        custom_domains_removed_at = NULL
    WHERE id = ?
  `, [new Date().toISOString(), transfer.id])

  return { completed: true, restoredDomains }
}

function reminderThresholdForCount(reminderCount: number): number {
  if (reminderCount < REMINDER_THRESHOLDS_DAYS.length) {
    const threshold = REMINDER_THRESHOLDS_DAYS[reminderCount]
    if (typeof threshold === 'number') return threshold
    return REMINDER_THRESHOLDS_DAYS[REMINDER_THRESHOLDS_DAYS.length - 1] as number
  }
  return 7 + (reminderCount - 2) * 7
}

export async function processSiteTransferReminders(
  env: SiteTransferEnv,
  db: D1Database,
  opts: { force?: boolean; now?: Date } = {},
): Promise<{ reminded: number; paused_domains: number; checked: number }> {
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const transfers = await queryAll<TransferReminderRow>(db, `
    SELECT r.id, r.site_id, r.from_organization_id, r.to_email, r.token, r.created_at,
           r.invited_plan, r.invited_domain, r.reminder_count, r.requires_payment,
           r.custom_domains_snapshot, r.custom_domains_removed_at,
           s.brand_name AS site_name
    FROM site_transfer_requests r
    JOIN sites s ON s.id = r.site_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `)

  let checked = 0
  let reminded = 0
  let pausedDomains = 0

  for (const transfer of transfers || []) {
    checked += 1
    const createdAt = new Date(transfer.created_at)
    const daysPending = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS))
    const reminderCount = Math.max(0, Number(transfer.reminder_count || 0))

    if (
      transfer.requires_payment
      && !transfer.custom_domains_removed_at
      && daysPending >= DOMAIN_PAUSE_AFTER_DAYS
    ) {
      const snapshotRaw = transfer.custom_domains_snapshot
        || serializeTransferDomainSnapshot(await buildTransferDomainSnapshot(db, transfer.site_id))

      await execute(db, `
        UPDATE site_transfer_requests
        SET custom_domains_snapshot = ?
        WHERE id = ?
      `, [snapshotRaw, transfer.id])

      const deleted = await deleteSiteCustomDomains(env, db, transfer.site_id, 'system')
      if (deleted.failedDomainIds.length === 0) {
        await execute(db, `
          UPDATE site_transfer_requests
          SET custom_domains_removed_at = ?
          WHERE id = ?
        `, [nowIso, transfer.id])
      } else {
        console.error('site_transfer_domain_pause_incomplete', {
          transferId: transfer.id,
          failedDomainIds: deleted.failedDomainIds,
        })
      }

      pausedDomains += deleted.deletedCount
    }

    const threshold = reminderThresholdForCount(reminderCount)
    if (!opts.force && daysPending < threshold) continue

    await notifySiteTransferReminder(env, db, {
      organizationId: transfer.from_organization_id,
      siteId: transfer.site_id,
      toEmail: transfer.to_email,
      siteName: transfer.site_name || transfer.site_id,
      transferUrl: `https://${normalizeHost(env.NUXT_PUBLIC_PLATFORM_DOMAIN) || 'krabiclaw.com'}/transfer/${transfer.token}`,
      invitedPlan: transfer.invited_plan,
      invitedDomain: transfer.invited_domain,
      daysPending,
      customDomainsPaused: Boolean(transfer.requires_payment)
        && (Boolean(transfer.custom_domains_removed_at) || daysPending >= DOMAIN_PAUSE_AFTER_DAYS),
    })

    await execute(db, `
      UPDATE site_transfer_requests
      SET last_reminder_at = ?, reminder_count = COALESCE(reminder_count, 0) + 1
      WHERE id = ?
    `, [nowIso, transfer.id])
    reminded += 1
  }

  return { reminded, paused_domains: pausedDomains, checked }
}
