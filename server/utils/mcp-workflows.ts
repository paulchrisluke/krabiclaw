import { contentRegistry } from "~/config/content-registry";
import { resolveSiteCmsCapabilities } from "~/server/utils/cms-capabilities";
import { hasSiteEntitlement } from "~/server/utils/billing";
import {
  getGoogleBusinessAccounts,
  getGoogleBusinessAuthUrl,
  getGoogleBusinessConnection,
  getGoogleBusinessLocations,
  syncGoogleLocations,
} from "~/server/utils/google-business";
import {
  getOrgWhatsAppPhone,
  setOrgWhatsAppPhone,
} from "~/server/utils/whatsapp";
import type { CloudflareEnv } from "~/server/utils/auth";
import { signOAuthState } from "~/server/utils/encryption";
import { updateLocation } from "~/server/utils/location-management";
import { execute, queryAll, queryFirst, type DbClient } from "~/server/db";
import { revokeReviewRequestForBooking } from "~/server/utils/review-requests";
import { fireSiteEventSafe } from "~/server/utils/site-events";
import { reorderQa, updateQa } from "~/server/utils/location-qa";

export async function listSitesForUser(
  db: D1Database,
  userId: string,
) {
  const orgRows = await queryAll<{ id: string }>(db, `
    SELECT o.id
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
  `, [userId]);

  const orgIds = orgRows.map((row) => row.id).filter(Boolean);
  if (!orgIds.length) return [];

  const placeholders = orgIds.map(() => "?").join(", ");
  return await queryAll<Record<string, unknown>>(db, `
    SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
           s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
    FROM sites s
    WHERE s.organization_id IN (${placeholders})
    ORDER BY s.created_at DESC
  `, orgIds);
}

export async function getSiteForMcp(
  db: D1Database,
  siteId: string,
  userId: string,
) {
  const site = await queryFirst<Record<string, unknown>>(db, `
      SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
             s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
      FROM sites s
      JOIN member m ON s.organization_id = m.organizationId
      WHERE s.id = ? AND m.userId = ?
      LIMIT 1
    `, [siteId, userId]);

  if (!site) throw new Error("Site not found or access denied");
  return site;
}

async function assertSiteContentPage(
  db: DbClient,
  organizationId: string,
  siteId: string,
  page: string,
) {
  const site = await queryFirst<{ vertical: string; theme_id: string; feature_overrides: string | null }>(db, `
    SELECT vertical, theme_id, feature_overrides FROM sites
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [siteId, organizationId]);
  if (!site) throw createError({ statusCode: 404, statusMessage: `Site "${siteId}" was not found.` });
  const { vertical, template, capabilities: capability } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
    siteEnabledFeatures: site.feature_overrides,
  });
  const pageCapability = capability.pages.find(candidate => candidate.id === page);
  if (!pageCapability) {
    throw createError({ statusCode: 400, statusMessage: `Page "${page}" is not available for ${vertical}/${template}.` });
  }
  if (pageCapability.editor !== "tenant_pages") {
    throw createError({ statusCode: 400, statusMessage: `Page "${page}" is owned by the ${pageCapability.editor} editor.` });
  }
  return pageCapability;
}

export async function getLocationForMcp(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const byId = await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*, img.public_url AS hero_public_url, img.thumbnail_url AS hero_thumbnail_url, img.kind AS hero_kind
    FROM business_locations bl
    LEFT JOIN media_assets img ON bl.hero_media_asset_id = img.id AND img.status = 'active'
      AND img.organization_id = bl.organization_id AND img.site_id = bl.site_id
    WHERE bl.id = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `, [locationIdOrSlug, organizationId, siteId]);
  const row = byId ?? await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*, img.public_url AS hero_public_url, img.thumbnail_url AS hero_thumbnail_url, img.kind AS hero_kind
    FROM business_locations bl
    LEFT JOIN media_assets img ON bl.hero_media_asset_id = img.id AND img.status = 'active'
      AND img.organization_id = bl.organization_id AND img.site_id = bl.site_id
    WHERE bl.slug = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `, [locationIdOrSlug, organizationId, siteId]);

  if (!row) throw new Error("Location not found");
  return {
    ...row,
    address: safeJson(row.address),
    opening_hours: safeJson(row.opening_hours),
    categories: safeJson(row.categories),
    is_primary: Boolean(row.is_primary),
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
  env?: CloudflareEnv,
  actorHeaders?: HeadersInit,
) {
  const ops: Promise<unknown>[] = []
  const trimmedPhone = whatsappPhone?.trim()
  // Explicit null or empty string means clear the phone
  if (whatsappPhone !== undefined) {
    ops.push(setOrgWhatsAppPhone(db, organizationId, siteId, trimmedPhone || '', env, { actorHeaders }))
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
    locationClause = `AND location_id IN (${opts.locationIds.map(() => '?').join(', ')})`
    params.push(...opts.locationIds)
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
    SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
           owner_reply_at, photo_urls, source, status, created_at, updated_at
    FROM reviews
    WHERE site_id = ? AND location_id = ?
    ORDER BY created_at DESC
  `, [siteId, locationId]);

  return rows.map((review) => ({
    ...review,
    photo_urls: safeJsonArray(review.photo_urls),
  }));
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

async function resolveTenantPagePath(db: DbClient, siteId: string, page: string, locationId?: string) {
  if (page === 'location') {
    if (!locationId) throw createError({ statusCode: 400, statusMessage: 'Location pages require an explicit location_id.' })
    const location = await queryFirst<{ slug: string }>(db, 'SELECT slug FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1', [locationId, siteId])
    if (!location) throw createError({ statusCode: 404, statusMessage: 'Location not found.' })
    return `/locations/${location.slug}`
  }
  const path = contentRegistry[page]?.path
  if (!path) throw createError({ statusCode: 400, statusMessage: `Page "${page}" is not registered as a tenant page.` })
  return path
}

export function buildTenantPageReplacementConfirmationToken(expectedDocumentUpdatedAt: string, removedBlockIds: readonly string[]) {
  return `tenant-page-replacement:${expectedDocumentUpdatedAt}:${[...removedBlockIds].sort().join(',')}`
}

export async function updatePageContent(
  db: DbClient,
  organizationId: string,
  siteId: string,
  input: {
    page: string;
    changes: Record<string, unknown>;
    location_id?: string | null;
  },
  actorId?: string | null,
) {
  const locationId = input.location_id ?? undefined;
  const pageDefinition = await assertSiteContentPage(db, organizationId, siteId, input.page);
  if (pageDefinition.scope === "location" && !locationId) {
    throw createError({ statusCode: 400, statusMessage: `Page "${input.page}" requires an explicit location_id.` });
  }
  if (pageDefinition.scope === "site" && locationId) {
    throw createError({ statusCode: 400, statusMessage: `Page "${input.page}" is site-scoped and does not accept location_id.` });
  }
  if (locationId) {
    const location = await queryFirst<{ id: string }>(db, `
      SELECT id FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [locationId, organizationId, siteId]);
    if (!location) throw createError({ statusCode: 404, statusMessage: `Location "${locationId}" is not owned by site "${siteId}".` });
  }

  if (pageDefinition.editor !== "tenant_pages") throw createError({ statusCode: 410, statusMessage: 'Page authoring is available through the canonical Pages manager and complete block snapshots.' });
  if (!Array.isArray(input.changes.blocks)) {
    throw createError({ statusCode: 400, statusMessage: 'Tenant page updates must provide the canonical blocks array.' });
  }
  const { getTenantPageForEditorByPath, updateTenantPageDraft } = await import('~/server/utils/tenant-pages');
  const canonicalPath = await resolveTenantPagePath(db, siteId, input.page, locationId);
  const page = await getTenantPageForEditorByPath(db, siteId, canonicalPath);
  const incomingBlockIds = new Set(
    (input.changes.blocks as unknown[])
      .map(block => block && typeof block === 'object' && 'id' in block && typeof (block as { id?: unknown }).id === 'string'
        ? (block as { id: string }).id
        : null)
      .filter((id): id is string => Boolean(id)),
  )
  const removedBlockIds = page.blocks
    .map(block => block.id)
    .filter(blockId => !incomingBlockIds.has(blockId))
  if (removedBlockIds.length) {
    const expectedDocumentUpdatedAt = typeof input.changes.expected_document_updated_at === 'string'
      ? input.changes.expected_document_updated_at
      : typeof input.changes.expectedDocumentUpdatedAt === 'string'
        ? input.changes.expectedDocumentUpdatedAt
        : ''
    const requestedRemovedIds = Array.isArray(input.changes.removed_block_ids)
      ? input.changes.removed_block_ids.filter((id): id is string => typeof id === 'string').sort()
      : []
    const confirmationToken = typeof input.changes.confirmation_token === 'string'
      ? input.changes.confirmation_token
      : ''
    const expectedToken = buildTenantPageReplacementConfirmationToken(page.document.updated_at, removedBlockIds)
    if (expectedDocumentUpdatedAt !== page.document.updated_at || requestedRemovedIds.join(',') !== [...removedBlockIds].sort().join(',') || confirmationToken !== expectedToken) {
      throw createError({
        statusCode: 409,
        statusMessage: `Complete block replacement would remove ${removedBlockIds.length} existing block(s). Confirm with expected_document_updated_at="${page.document.updated_at}", removed_block_ids=${JSON.stringify([...removedBlockIds].sort())}, confirmation_token="${expectedToken}".`,
      })
    }
  }
  const expectedDocumentUpdatedAt = typeof input.changes.expected_document_updated_at === 'string'
    ? input.changes.expected_document_updated_at
    : typeof input.changes.expectedDocumentUpdatedAt === 'string'
      ? input.changes.expectedDocumentUpdatedAt
      : page.document.updated_at
  const result = await updateTenantPageDraft(db, page.id, {
    userId: actorId ?? null,
    scope: { siteId, organizationId },
    data: {
      path: typeof input.changes.path === 'string' ? input.changes.path : page.path,
      title: typeof input.changes.title === 'string' ? input.changes.title : page.title,
      summary: typeof input.changes.summary === 'string' ? input.changes.summary : page.summary,
      seoTitle: typeof input.changes.seoTitle === 'string' ? input.changes.seoTitle : page.seo_title,
      seoDescription: typeof input.changes.seoDescription === 'string' ? input.changes.seoDescription : page.seo_description,
      canonicalUrl: typeof input.changes.canonicalUrl === 'string' ? input.changes.canonicalUrl : page.canonical_url,
      robots: typeof input.changes.robots === 'string' ? input.changes.robots : page.robots,
      pageType: page.page_type,
      recipe: page.recipe,
      sortOrder: page.sort_order,
      blocks: input.changes.blocks,
      expectedDocumentUpdatedAt,
    },
  });
  await fireSiteEventSafe({
    db,
    organizationId,
    siteId,
    locationId: locationId ?? null,
    actorId,
    eventType: 'content.updated',
    entityType: 'tenant_page',
    entityId: page.id,
    metadata: { page: input.page, editor: 'tenant_pages', block_count: result.page.blocks.length },
  });
  return {
    success: true,
    page: input.page,
    location_id: locationId ?? null,
    changes_count: input.changes.blocks.length,
    public_path: result.page.path,
  };
}

export async function getEditorContent(
  db: DbClient,
  organizationId: string,
  siteId: string,
  page: string,
  locationId?: string,
) {
  const pageDefinition = await assertSiteContentPage(db, organizationId, siteId, page);
  if (pageDefinition.scope === "location" && !locationId) {
    throw createError({ statusCode: 400, statusMessage: `Page "${page}" requires an explicit location_id.` });
  }
  if (pageDefinition.scope === "site" && locationId) {
    throw createError({ statusCode: 400, statusMessage: `Page "${page}" is site-scoped and does not accept location_id.` });
  }
  if (locationId) {
    const location = await queryFirst<{ id: string }>(db, `
      SELECT id FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [locationId, organizationId, siteId]);
    if (!location) throw createError({ statusCode: 404, statusMessage: `Location "${locationId}" is not owned by site "${siteId}".` });
  }

  if (pageDefinition.editor !== "tenant_pages") throw createError({ statusCode: 410, statusMessage: 'Page authoring is available through the canonical Pages manager.' });
  const { getTenantPageForEditorByPath } = await import('~/server/utils/tenant-pages');
  const canonicalPath = await resolveTenantPagePath(db, siteId, page, locationId);
  const canonicalPage = await getTenantPageForEditorByPath(db, siteId, canonicalPath);
  return {
    success: true,
    page: canonicalPage,
    blocks: canonicalPage.blocks,
    siteId,
    locationId: locationId ?? null,
    public_path: canonicalPage.path,
    schema: { page, fields: ['blocks'], structured: ['blocks'] },
    replacement_confirmation: {
      expected_document_updated_at: canonicalPage.document.updated_at,
      current_block_ids: canonicalPage.blocks.map(block => block.id),
      confirmation_format: 'tenant-page-replacement:<expected_document_updated_at>:<sorted_removed_block_ids_comma_separated>',
    },
  };
}

export async function updateHomeHero(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: {
    title?: string | null;
    subtitle?: string | null;
    location_id?: string | null;
  },
) {
  if (input.location_id) throw createError({ statusCode: 400, statusMessage: 'The canonical home page is site-scoped; update a location page for location-specific content.' })
  const { getTenantPageForEditorByPath, updateTenantPageDraft } = await import('~/server/utils/tenant-pages')
  const page = await getTenantPageForEditorByPath(db, siteId, '/')
  const blocks = page.blocks.map(block => block.type === 'hero'
    ? { ...block, data: { ...block.data, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}) } }
    : block)
  const result = await updateTenantPageDraft(db, page.id, {
    userId: null,
    scope: { siteId, organizationId },
    data: {
      path: page.path,
      title: page.title,
      summary: page.summary,
      seoTitle: page.seo_title,
      seoDescription: page.seo_description,
      canonicalUrl: page.canonical_url,
      robots: page.robots,
      pageType: page.page_type,
      recipe: page.recipe,
      sortOrder: page.sort_order,
      blocks,
      expectedDocumentUpdatedAt: page.document.updated_at,
    },
  })

  return {
    success: true,
    page: "home",
    changes_count: 1,
    public_path: result.page.path,
  };
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
  const touchesNotificationPhone = Object.prototype.hasOwnProperty.call(updates, "notification_phone");
  const previousNotificationPhone = location.notification_phone;

  const result = await updateLocation(
    db,
    organizationId,
    siteId,
    location.id,
    updates,
    userId,
  );

  if (result.status >= 400) {
    return result;
  }

  // Sync WhatsApp access if notification_phone was updated. This is
  // onboarding-time hydration of a pre-seeded location, not a
  // user-initiated interactive save — a WhatsApp provisioning hiccup
  // shouldn't block the rest of onboarding, so this logs and continues
  // (matching other non-critical steps in this file, e.g. fireSiteEventSafe)
  // rather than throwing, but the caller still needs to know the location
  // itself saved successfully while WhatsApp access needs attention.
  let whatsAppSyncWarning: string | undefined
  if (touchesNotificationPhone) {
    const { syncLocationWhatsAppAccess } = await import('~/server/utils/location-management')
    const syncResult = await syncLocationWhatsAppAccess(env, db, {
      organizationId,
      siteId,
      locationId: location.id,
      previousPhone: previousNotificationPhone,
      newPhone: (updates.notification_phone as string | null | undefined) ?? null,
      inviterUserId: userId,
    })
    if (!syncResult.ok) {
      const detail = syncResult.provisioningError || syncResult.scopeRecalcError || 'unknown error'
      console.warn('hydrate_seeded_location_whatsapp_sync_failed', { organizationId, siteId, locationId: location.id, error: detail })
      whatsAppSyncWarning = `The location was saved, but syncing WhatsApp manager access failed: ${detail}. Retry updating the notification phone to re-sync it.`
    }
  }

  return {
    ...result.data,
    hydrated_seed_location: true,
    previous_slug: location.slug,
    ...(whatsAppSyncWarning ? { warning: whatsAppSyncWarning } : {}),
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
  throw createError({ statusCode: 410, statusMessage: 'Field-based page deletion has been removed. Delete a block in the Pages manager and save the complete draft.' });
}

export async function getGoogleBusinessLocationConnectionForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
) {
  const entitled = await hasSiteEntitlement(db, siteId, "google_business");
  if (!entitled) {
    throw new Error("Google Business integration requires a paid plan.");
  }
  const connection = await getGoogleBusinessConnection(
    env,
    organizationId,
    siteId,
    locationId,
  );
  if (!connection) return null;
  return {
    id: connection.id,
    provider_account_email: connection.provider_account_email,
    status: connection.status,
    expires_at: connection.expires_at,
    created_at: connection.created_at,
    updated_at: connection.updated_at,
  };
}

export async function getGoogleBusinessLocationAuthUrlForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  userId: string,
) {
  const entitled = await hasSiteEntitlement(db, siteId, "google_business");
  if (!entitled) {
    throw new Error("Google Business integration requires a paid plan.");
  }
  const secret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (!secret)
    throw new Error("Server misconfiguration: encryption key not set");

  const state = await signOAuthState(secret, {
    siteId,
    organizationId,
    userId,
    locationId,
    timestamp: Date.now(),
  });
  return { auth_url: getGoogleBusinessAuthUrl(env, state) };
}

export async function listGoogleBusinessAccountsForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  const entitled = await hasSiteEntitlement(db, siteId, "google_business");
  if (!entitled) {
    throw new Error("Google Business integration requires a paid plan.");
  }
  const connection = await getGoogleBusinessConnection(
    env,
    organizationId,
    siteId,
  );
  if (!connection) throw new Error("Google Business not connected");

  const accounts = await getGoogleBusinessAccounts(
    env,
    connection.encrypted_access_token,
  );
  const accountsWithLocations = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      locations: await getGoogleBusinessLocations(
        env,
        connection.encrypted_access_token,
        account.name,
      ),
    })),
  );

  return {
    connection: {
      id: connection.id,
      provider_account_email: connection.provider_account_email,
      status: connection.status,
      connected_at: connection.created_at,
    },
    accounts: accountsWithLocations,
  };
}

export async function syncGoogleBusinessLocationsForMcp(
  env: CloudflareEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  accountId: string,
  locationIds: string[],
) {
  const entitled = await hasSiteEntitlement(db, siteId, "google_business");
  if (!entitled) {
    throw new Error("Google Business integration requires a paid plan.");
  }
  const connection = await getGoogleBusinessConnection(
    env,
    organizationId,
    siteId,
  );
  if (!connection) throw new Error("Google Business not connected");

  const allLocations = await getGoogleBusinessLocations(
    env,
    connection.encrypted_access_token,
    accountId,
  );
  const selectedLocations = allLocations.filter((location) =>
    locationIds.includes(location.name),
  );
  if (!selectedLocations.length) throw new Error("No valid locations found");

  const { reviewsUpserted } = await syncGoogleLocations(
    env,
    organizationId,
    siteId,
    selectedLocations,
    connection.encrypted_access_token,
  );

  return {
    success: true,
    synced_locations: selectedLocations.length,
    reviews_upserted: reviewsUpserted,
  };
}

function safeJson(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeJsonArray(value: unknown) {
  const parsed = safeJson(value);
  return Array.isArray(parsed) ? parsed : [];
}
