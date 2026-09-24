
import {
} from "~/server/utils/whatsapp";
import type { CloudflareEnv } from "~/server/utils/auth";
import { queryAll, queryFirst } from "~/server/db";
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
    SELECT s.id, s.theme_id, s.name, s.slug, s.subdomain,
           (SELECT domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active') AS public_url, s.status, s."createdAt" AS created_at, s.updated_at, s.onboarding_status
    FROM organization s
    WHERE s.id IN (SELECT value FROM json_each(?))
    ORDER BY s."createdAt" DESC
  `, [d1JsonStringSet(orgIds)]);
}

export async function getSiteForMcp(
  db: D1Database,
  env: CloudflareEnv,
  organizationId: string,
  userId: string,
) {
  const site = await queryFirst<Record<string, unknown>>(db, `
      SELECT s.id, s.name, s.theme_id, s.slug, s.subdomain,
             (SELECT domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = s.id AND role = 'canonical' AND status = 'active') AS public_url, s.status, s.updated_at, s.onboarding_status
      FROM organization s
      WHERE s.id = ?
      LIMIT 1
    `, [organizationId]);

  const membership = await resolveOrganizationMembership(env, { organizationId, userId })
  if (!site || !membership) throw new Error("Organization not found or access denied");
  return site;
}


export async function listContactSubmissions(
  db: D1Database,
  organizationId: string,
  opts: { locationIds?: string[] | null } = {},
) {
  const params: string[] = [organizationId]
  let locationClause = ''
  if (opts.locationIds) {
    if (opts.locationIds.length === 0) return []
    locationClause = `AND location_id IN (SELECT value FROM json_each(?))`
    params.push(d1JsonStringSet(opts.locationIds))
  }
  return await queryAll<Record<string, unknown>>(db, `
    SELECT id, organization_id, location_id, json_extract(payload_json, '$.guest.name') AS name, json_extract(payload_json, '$.guest.email') AS email, json_extract(payload_json, '$.subject') AS subject, json_extract(payload_json, '$.message') AS message, created_at FROM requests
    WHERE kind = 'contact' AND organization_id = ?
      ${locationClause}
    ORDER BY created_at DESC
    LIMIT 200
  `, params);
}

export async function listReservationSubmissions(
  db: D1Database,
  organizationId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [organizationId]
  let where = `rs.kind = 'reservation' AND rs.organization_id = ?`
  if (opts.locationId) {
    where += ` AND res.location_id = ?`
    params.push(opts.locationId)
  }
  if (opts.sinceDays) {
    where += ` AND rs.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
    params.push(`-${opts.sinceDays} days`)
  }
  const rows = await queryAll<Record<string, unknown> & { starts_at: string; timezone: string }>(db, `
    SELECT rs.id, rs.organization_id, res.location_id, rs.customer_id, res.status, res.starts_at, res.timezone, CAST(res.party_size AS TEXT) || CASE json_extract(rs.payload_json, '$.party_size_is_minimum') WHEN 1 THEN '+' ELSE '' END AS guests, json_extract(rs.payload_json, '$.guest.name') AS name, json_extract(rs.payload_json, '$.guest.email') AS email, json_extract(rs.payload_json, '$.guest.phone') AS phone, json_extract(rs.payload_json, '$.notes') AS requests, rs.created_at, rs.updated_at, bl.title AS location_title
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
  organizationId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
) {
  const params: (string | number)[] = [organizationId]
  let where = `rs.kind = 'reservation' AND rs.organization_id = ?`
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
  organizationId: string,
  opts: { locationId?: string | null; sinceDays?: number | null } = {},
): Promise<Record<string, number>> {
  const params: (string | number)[] = [organizationId]
  let where = `rs.kind = 'reservation' AND rs.organization_id = ?`
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
  locationId: string,
  qaId: string,
  updates: Record<string, unknown>,
) {
  return updateQa(db, { organizationId, locationId }, qaId, updates)
}

export async function reorderLocationQa(
  db: D1Database,
  organizationId: string,
  locationId: string,
  updates: Array<{ id: string; sort_order: number }>,
) {
  return reorderQa(db, { organizationId, locationId }, updates)
}

export async function listLocationReviews(
  db: D1Database,
  organizationId: string,
  locationId: string,
) {
  const rows = await queryAll<Record<string, unknown>>(db, `
    SELECT r.id, r.author_name, r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at,
           r.source, r.status, r.created_at, r.updated_at
    FROM reviews r
    WHERE r.organization_id = ? AND r.location_id = ?
    ORDER BY r.created_at DESC
  `, [organizationId, locationId]);

  const { attachReviewMedia } = await import('~/server/utils/site-reviews')
  return await attachReviewMedia(db, organizationId, rows)
}
export function buildTenantPageReplacementConfirmationToken(expectedUpdatedAt: string, removedBlockIds: readonly string[]) {
  return `tenant-page-replacement:${expectedUpdatedAt}:${[...removedBlockIds].sort().join(',')}`
}

