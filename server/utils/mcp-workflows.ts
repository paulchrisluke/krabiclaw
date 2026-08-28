import { HTTPError } from 'nitro';

import {
  getOrgWhatsAppPhone,
  setOrgWhatsAppPhone,
} from "~/server/utils/whatsapp";
import type { CloudflareEnv } from "~/server/utils/auth";
import { updateLocation } from "~/server/utils/location-management";
import { execute, queryAll, queryFirst, type DbClient } from "~/server/db";
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { revokeReviewRequestForBooking } from "~/server/utils/review-requests";
import { reorderQa, updateQa } from "~/server/utils/location-qa";
import { listUserOrganizations, resolveOrganizationMembership } from '~/server/utils/member-access'

export async function listSitesForUser(
  db: D1Database,
  env: CloudflareEnv,
  userId: string,
) {
  const orgIds = (await listUserOrganizations(env, userId)).map(organization => organization.id)
  if (!orgIds.length) return [];

  return await queryAll<Record<string, unknown>>(db, `
    SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
           s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
    FROM sites s
    WHERE s.organization_id IN (SELECT value FROM json_each(?))
    ORDER BY s.created_at DESC
  `, [d1JsonStringSet(orgIds)]);
}

export async function getSiteForMcp(
  db: D1Database,
  env: CloudflareEnv,
  siteId: string,
  userId: string,
) {
  const site = await queryFirst<Record<string, unknown>>(db, `
      SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
             s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
      FROM sites s
      WHERE s.id = ?
      LIMIT 1
    `, [siteId]);

  const organizationId = typeof site?.organization_id === 'string' ? site.organization_id : ''
  const membership = organizationId
    ? await resolveOrganizationMembership(env, { organizationId, userId })
    : null
  if (!site || !membership) throw new Error("Site not found or access denied");
  return site;
}

export async function getLocationForMcp(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const byId = await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*
    FROM business_locations bl
    WHERE bl.id = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `, [locationIdOrSlug, organizationId, siteId]);
  const row = byId ?? await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*
    FROM business_locations bl
    WHERE bl.slug = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `, [locationIdOrSlug, organizationId, siteId]);

  if (!row) throw new Error("Location not found");
  const { getMediaPlacements } = await import('~/server/utils/media-placement')
  const placements = await getMediaPlacements(db, { siteId, ownerType: 'business_location', ownerIds: [String(row.id)] })
  return {
    ...row,
    address: safeJson(row.address),
    opening_hours: safeJson(row.opening_hours),
    categories: safeJson(row.categories),
    is_primary: Boolean(row.is_primary),
    media: (placements.get(String(row.id)) ?? []).map(item => ({ asset_id: item.asset_id, slot: item.slot, public_url: item.public_url, thumbnail_url: item.thumbnail_url, kind: item.kind, sort_order: item.sort_order })),
  };
}

export async function getNotificationsSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  const [whatsappPhone, channelsRow] = await Promise.all([
    getOrgWhatsAppPhone(db, organizationId, siteId),
    queryFirst<{ value: string }>(
      db,
      `SELECT value FROM site_config WHERE organization_id = ? AND site_id = ? AND key = 'owner_notification_channels' LIMIT 1`,
      [organizationId, siteId],
    ),
  ])
  // Mirrors the send-time default in server/utils/notifications.ts getOwnerNotificationChannels:
  // only default to whatsapp if a number is actually configured, otherwise email.
  const defaultChannels = whatsappPhone ? ['whatsapp'] : ['email']
  let channels: string[] = defaultChannels
  if (channelsRow?.value) {
    try {
      const parsed = JSON.parse(channelsRow.value)
      if (Array.isArray(parsed)) {
        const validChannels = parsed.filter(c => c === 'whatsapp' || c === 'email')
        // Drop whatsapp from channels if no whatsapp phone is configured
        const availableChannels = whatsappPhone ? validChannels : validChannels.filter(c => c !== 'whatsapp')
        channels = availableChannels.length ? availableChannels : defaultChannels
      }
    } catch {
      channels = defaultChannels
    }
  }
  return { whatsapp_phone: whatsappPhone, channels }
}

export async function updateNotificationsSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
  whatsappPhone?: string,
  channels?: string[],
) {
  const ops: Promise<unknown>[] = []
  const trimmedPhone = whatsappPhone?.trim()
  // Explicit null or empty string means clear the phone
  if (whatsappPhone !== undefined) {
    ops.push(setOrgWhatsAppPhone(db, organizationId, siteId, trimmedPhone || ''))
  }
  if (channels) {
    const defaultPhone = trimmedPhone || await getOrgWhatsAppPhone(db, organizationId, siteId)
    const validChannels = channels.filter(c => c === 'whatsapp' || c === 'email')
    // Filter out whatsapp if no phone is available
    const channelsToPersist = defaultPhone ? validChannels : validChannels.filter(c => c !== 'whatsapp')
    const finalChannels = channelsToPersist.length ? channelsToPersist : ['email']
    const value = JSON.stringify(finalChannels)
    ops.push(
      execute(
        db,
        `INSERT INTO site_config (organization_id, site_id, key, value) VALUES (?, ?, 'owner_notification_channels', ?) ON CONFLICT(organization_id, site_id, key) DO UPDATE SET value = excluded.value`,
        [organizationId, siteId, value],
      )
    )
  }
  await Promise.all(ops)
  return await getNotificationsSettings(db, organizationId, siteId)
}

export async function listContactSubmissions(
  db: D1Database,
  siteId: string,
  opts: { locationIds?: string[] | null } = {},
) {
  const params: string[] = [siteId]
  let locationClause = ''
  if (opts.locationIds) {
    if (opts.locationIds.length === 0) return []
    locationClause = `AND location_id IN (SELECT value FROM json_each(?))`
    params.push(d1JsonStringSet(opts.locationIds))
  }
  return await queryAll<Record<string, unknown>>(db, `
    SELECT * FROM contact_submissions
    WHERE site_id = ?
      ${locationClause}
    ORDER BY created_at DESC
    LIMIT 200
  `, params);
}

export async function updateContactSubmissionStatus(
  db: D1Database,
  siteId: string,
  submissionId: string,
  status: string,
) {
  if (!["new", "read", "replied"].includes(status)) {
    throw new Error("Invalid contact submission status");
  }

  const result = await execute(db, `
    UPDATE contact_submissions
    SET status = ?
    WHERE id = ? AND site_id = ?
  `, [status, submissionId, siteId]);

  if (!result.meta.changes) throw new Error("Submission not found");
  return {
    updated: true,
    submission_id: submissionId,
    status,
  };
}

export async function listReservationSubmissions(
  db: D1Database,
  siteId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [siteId]
  let where = `rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND rs.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= datetime('now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  return await queryAll<Record<string, unknown>>(db, `
    SELECT rs.*, bl.title AS location_title
    FROM reservation_submissions rs
    LEFT JOIN business_locations bl ON bl.id = rs.location_id
    WHERE ${where}
    ORDER BY rs.created_at DESC
    LIMIT 200
  `, params);
}

export async function countReservationSubmissions(
  db: D1Database,
  siteId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [siteId]
  let where = `rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND rs.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= datetime('now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  const row = await queryFirst<{ total: number }>(db, `
    SELECT COUNT(*) AS total
    FROM reservation_submissions rs
    WHERE ${where}
  `, params);
  return row?.total ?? 0;
}

export async function getReservationSubmissionsByStatus(
  db: D1Database,
  siteId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
): Promise<Record<string, number>> {
  const params: (string | number)[] = [siteId]
  let where = `rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND rs.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= datetime('now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  const results = await queryAll<{ status: string; count: number }>(db, `
    SELECT status, COUNT(*) as count
    FROM reservation_submissions rs
    WHERE ${where}
    GROUP BY status
  `, params);
  const byStatus: Record<string, number> = {}
  for (const row of results ?? []) {
    byStatus[row.status] = row.count
  }
  return byStatus
}

export async function updateReservationSubmissionStatus(
  db: DbClient,
  siteId: string,
  submissionId: string,
  status: string,
  opts: { locationId?: string | null } = {},
) {
  if (!["new", "confirmed", "cancelled", "completed"].includes(status)) {
    throw new Error("Invalid reservation submission status");
  }

  const now = new Date().toISOString()
  const params = [status, now]
  const sets = [`status = ?`, `updated_at = ?`]
  if (status === 'completed') {
    sets.push(`completed_at = COALESCE(completed_at, ?)`, `completion_source = COALESCE(completion_source, 'manual')`)
    params.push(now)
  }
  params.push(submissionId, siteId)
  let where = `id = ? AND site_id = ?`
  if (opts.locationId) {
    where += ` AND location_id = ?`
    params.push(opts.locationId)
  }
  const result = await execute(db, `
    UPDATE reservation_submissions
    SET ${sets.join(', ')}
    WHERE ${where}
  `, params);

  if (!result.meta.changes) throw new Error("Reservation not found");
  if (status === 'cancelled') {
    await revokeReviewRequestForBooking(db, 'reservation', submissionId)
  }
  return {
    updated: true,
    submission_id: submissionId,
    status,
  };
}

export async function updateLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  qaId: string,
  updates: Record<string, unknown>,
) {
  return updateQa(db, { organizationId, siteId, locationId }, qaId, updates)
}

export async function reorderLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  updates: Array<{ id: string; sort_order: number }>,
) {
  return reorderQa(db, { organizationId, siteId, locationId }, updates)
}

export async function listLocationReviews(
  db: D1Database,
  siteId: string,
  locationId: string,
) {
  const rows = await queryAll<Record<string, unknown>>(db, `
    SELECT r.id, r.author_name, r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at,
           r.source, r.status, r.created_at, r.updated_at
    FROM reviews r
    WHERE r.site_id = ? AND r.location_id = ?
    ORDER BY r.created_at DESC
  `, [siteId, locationId]);

  const { attachReviewMedia } = await import('~/server/utils/site-reviews')
  return await attachReviewMedia(db, siteId, rows)
}

export async function listWorkRequestsForOrganization(
  db: D1Database,
  organizationId: string,
) {
  return await queryAll<Record<string, unknown>>(db, `
    SELECT id, type, title, description, status, priority, source, notes, created_at, updated_at, completed_at
    FROM work_requests
    WHERE organization_id = ?
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 100
  `, [organizationId]);
}

export function buildTenantPageReplacementConfirmationToken(expectedDocumentUpdatedAt: string, removedBlockIds: readonly string[]) {
  return `tenant-page-replacement:${expectedDocumentUpdatedAt}:${[...removedBlockIds].sort().join(',')}`
}

export async function hydrateSeededLocationForOnboarding(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  userId: string,
  updates: Record<string, unknown>,
) {
  const locations = await queryAll<{ id: string; slug: string; notification_phone: string | null }>(db, `
    SELECT id, slug, notification_phone
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
    ORDER BY is_primary DESC, created_at ASC
  `, [organizationId, siteId]);
  if (locations.length !== 1) {
    throw new Error(
      "Location limit reached and no single seeded location was available to hydrate.",
    );
  }

  const location = locations[0]!;

  const result = await updateLocation(
    db,
    organizationId,
    siteId,
    location.id,
    updates,
    userId,
    env,
  );

  if (result.status >= 400) {
    return result;
  }

  return {
    ...result.data,
    hydrated_seed_location: true,
    previous_slug: location.slug,
  };
}

export async function deleteContentField(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: { page: string; field: string; location_id?: string | null },
  actorId?: string | null,
) {
  void db; void organizationId; void siteId; void input; void actorId
  throw new HTTPError({ statusCode: 410, statusMessage: 'Field-based page deletion has been removed. Delete a block in the Pages manager and save the complete document.' });
}

function safeJson(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return JSON.parse(value)
}
