import { parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'

import {
  getOrgWhatsAppPhone,
  setOrgWhatsAppPhone,
} from "~/server/utils/whatsapp";
import type { CloudflareEnv } from "~/server/utils/auth";
import { execute, queryAll, queryFirst } from "~/server/db";
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { reorderQa, updateQa } from "~/server/utils/location-qa";
import { listUserOrganizations, resolveOrganizationMembership } from '~/server/utils/member-access'
import { localPartsAt } from '~/utils/timezone'

export async function listSitesForUser(
  db: D1Database,
  env: CloudflareEnv,
  userId: string,
) {
  const orgIds = (await listUserOrganizations(env, userId)).map(organization => organization.id)
  if (!orgIds.length) return [];

  return await queryAll<Record<string, unknown>>(db, `
    SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
           (SELECT domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active') AS public_url, s.status, s.created_at, s.updated_at, s.onboarding_status
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
             (SELECT domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM site_domains WHERE site_id = s.id AND role = 'canonical' AND status = 'active') AS public_url, s.status, s.created_at, s.updated_at, s.onboarding_status
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
    opening_hours: parseOpeningHours(row.opening_hours ? JSON.parse(String(row.opening_hours)) : null),
    special_hours: parseSpecialHours(row.special_hours ? JSON.parse(String(row.special_hours)) : null),
    categories: safeJson(row.categories),
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
      `SELECT json_extract(settings_json, '$.config.owner_notification_channels') AS value FROM sites WHERE organization_id = ? AND id = ? LIMIT 1`,
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
        `UPDATE sites SET settings_json = json_set(settings_json, '$.config.owner_notification_channels', json(?)) WHERE organization_id = ? AND id = ?`,
        [value, organizationId, siteId],
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
    SELECT id, organization_id, site_id, location_id, json_extract(payload_json, '$.guest.name') AS name, json_extract(payload_json, '$.guest.email') AS email, json_extract(payload_json, '$.subject') AS subject, json_extract(payload_json, '$.message') AS message, created_at FROM requests
    WHERE kind = 'contact' AND site_id = ?
      ${locationClause}
    ORDER BY created_at DESC
    LIMIT 200
  `, params);
}

export async function listReservationSubmissions(
  db: D1Database,
  siteId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [siteId]
  let where = `rs.kind = 'reservation' AND rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND res.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  const rows = await queryAll<Record<string, unknown> & { starts_at: string; timezone: string }>(db, `
    SELECT rs.id, rs.organization_id, rs.site_id, res.location_id, rs.customer_id, res.status, res.starts_at, res.timezone, CAST(res.party_size AS TEXT) || CASE json_extract(rs.payload_json, '$.party_size_is_minimum') WHEN 1 THEN '+' ELSE '' END AS guests, json_extract(rs.payload_json, '$.guest.name') AS name, json_extract(rs.payload_json, '$.guest.email') AS email, json_extract(rs.payload_json, '$.guest.phone') AS phone, json_extract(rs.payload_json, '$.notes') AS requests, rs.created_at, rs.updated_at, bl.title AS location_title
    FROM requests rs
    JOIN reservations res ON res.request_id = rs.id
    LEFT JOIN business_locations bl ON bl.id = res.location_id
    WHERE ${where}
    ORDER BY rs.created_at DESC
    LIMIT 200
  `, params);
  // The tool states a date and a time, as the schema declares and as an
  // assistant reads them back to the owner. The row holds one instant and the
  // zone it belongs to, so both are read off it here rather than stored twice.
  return rows.map((row) => {
    const parts = localPartsAt(new Date(row.starts_at), row.timezone)
    return {
      ...row,
      date: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
      time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
    }
  });
}

export async function countReservationSubmissions(
  db: D1Database,
  siteId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [siteId]
  let where = `rs.kind = 'reservation' AND rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND res.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  const row = await queryFirst<{ total: number }>(db, `
    SELECT COUNT(*) AS total
    FROM requests rs JOIN reservations res ON res.request_id = rs.id
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
  let where = `rs.kind = 'reservation' AND rs.site_id = ?`
  if (opts.locationId) {
    where += ` AND res.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  // Status belongs to the reservation, which is the thing that is pending,
  // confirmed or cancelled. The thread it answers has a conversation state.
  const results = await queryAll<{ status: string; count: number }>(db, `
    SELECT res.status, COUNT(*) as count
    FROM requests rs JOIN reservations res ON res.request_id = rs.id
    WHERE ${where}
    GROUP BY res.status
  `, params);
  const byStatus: Record<string, number> = {}
  for (const row of results ?? []) {
    byStatus[row.status] = row.count
  }
  return byStatus
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
export function buildTenantPageReplacementConfirmationToken(expectedUpdatedAt: string, removedBlockIds: readonly string[]) {
  return `tenant-page-replacement:${expectedUpdatedAt}:${[...removedBlockIds].sort().join(',')}`
}

function safeJson(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return JSON.parse(value)
}
