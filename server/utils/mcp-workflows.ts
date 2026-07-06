import { contentRegistry, getFieldDef } from "~/config/content-registry";
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
import {
  deleteSiteContentField,
  getPageContent,
  upsertSiteContent,
} from "~/server/utils/content-management";
import type { SiteContent } from "~/server/utils/content-management";
import type { CloudflareEnv } from "~/server/utils/auth";
import { signOAuthState } from "~/server/utils/encryption";
import { updateLocation } from "~/server/utils/location-management";
import { execute, queryAll, queryFirst } from "~/server/db";

export async function listSitesForUser(
  db: D1Database,
  userId: string,
  isPlatformAdmin: boolean,
) {
  if (isPlatformAdmin) {
    return await queryAll<Record<string, unknown>>(db, `
      SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
             s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
      FROM sites s
      ORDER BY s.created_at DESC
    `);
  }

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
  isPlatformAdmin = false,
) {
  const site = isPlatformAdmin
    ? await queryFirst<Record<string, unknown>>(db, `
      SELECT s.id, s.organization_id, s.theme_id, s.brand_name, s.slug, s.subdomain,
             s.custom_domain, s.status, s.plan, s.created_at, s.updated_at, s.onboarding_status
      FROM sites s
      WHERE s.id = ?
      LIMIT 1
    `, [siteId])
    : await queryFirst<Record<string, unknown>>(db, `
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

const HERO_FIELD_ALIASES: Record<
  string,
  "hero.title" | "hero.subtitle" | "hero.image" | "hero.video"
> = {
  hero_heading: "hero.title",
  hero_title: "hero.title",
  "hero.title": "hero.title",
  hero_subheading: "hero.subtitle",
  hero_subtitle: "hero.subtitle",
  "hero.subtitle": "hero.subtitle",
  hero_image_asset_id: "hero.image",
  "hero.image": "hero.image",
  hero_video_asset_id: "hero.video",
  "hero.video": "hero.video",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function editableFieldKeys(page: string) {
  return Object.keys(contentRegistry[page]?.fields ?? {});
}

function normalizeStringField(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Field "${field}" must be a string.`);
  }
  return value;
}

function normalizeHeroAssetField(
  value: unknown,
  field: string,
): string | null {
  if (value === null) return null;
  return normalizeStringField(value, field) || null;
}

function normalizeContentChanges(
  page: string,
  changes: Record<string, unknown>,
) {
  const normalizedFields = new Map<string, string>();
  const heroChange: Partial<SiteContent> = {};
  let hasHeroChange = false;

  for (const [rawField, rawValue] of Object.entries(changes)) {
    if (rawField === "hero") {
      if (!isRecord(rawValue)) {
        throw new Error(
          'Field "hero" must be an object with hero_title/hero_subtitle/media asset IDs.',
        );
      }

      const heroTitle = rawValue.hero_title;
      const heroSubtitle = rawValue.hero_subtitle;
      const heroImageAssetId = rawValue.hero_image_asset_id;
      const heroVideoAssetId = rawValue.hero_video_asset_id;

      if (heroTitle !== undefined)
        heroChange.hero_title =
          normalizeStringField(heroTitle, "hero.hero_title") || undefined;
      if (heroSubtitle !== undefined)
        heroChange.hero_subtitle =
          normalizeStringField(heroSubtitle, "hero.hero_subtitle") || undefined;
      if (heroImageAssetId !== undefined)
        heroChange.hero_image_asset_id =
          normalizeHeroAssetField(
            heroImageAssetId,
            "hero.hero_image_asset_id",
          );
      if (heroVideoAssetId !== undefined)
        heroChange.hero_video_asset_id =
          normalizeHeroAssetField(
            heroVideoAssetId,
            "hero.hero_video_asset_id",
          );

      if (
        heroTitle !== undefined ||
        heroSubtitle !== undefined ||
        heroImageAssetId !== undefined ||
        heroVideoAssetId !== undefined
      ) {
        hasHeroChange = true;
      }
      continue;
    }

    const heroAlias = HERO_FIELD_ALIASES[rawField];
    if (heroAlias) {
      hasHeroChange = true;
      if (heroAlias === "hero.title") {
        const value = normalizeStringField(rawValue, rawField);
        heroChange.hero_title = value || undefined;
      }
      if (heroAlias === "hero.subtitle") {
        const value = normalizeStringField(rawValue, rawField);
        heroChange.hero_subtitle = value || undefined;
      }
      if (heroAlias === "hero.image")
        heroChange.hero_image_asset_id = normalizeHeroAssetField(
          rawValue,
          rawField,
        );
      if (heroAlias === "hero.video")
        heroChange.hero_video_asset_id = normalizeHeroAssetField(
          rawValue,
          rawField,
        );
      continue;
    }

    const fieldDef = getFieldDef(page, rawField);
    if (!fieldDef) {
      const supported = editableFieldKeys(page);
      throw new Error(
        `Field "${rawField}" is not editable on page "${page}". Supported fields: ${supported.join(", ")}${supported.length ? ", " : ""}hero.title, hero.subtitle, hero.image, hero.video.`,
      );
    }

    normalizedFields.set(rawField, normalizeStringField(rawValue, rawField));
  }

  return { normalizedFields, heroChange, hasHeroChange };
}

export async function getLocationForMcp(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const byId = await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*, img.public_url AS hero_public_url, img.kind AS hero_kind
    FROM business_locations bl
    LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
    WHERE bl.id = ? AND bl.organization_id = ? AND bl.site_id = ?
    LIMIT 1
  `, [locationIdOrSlug, organizationId, siteId]);
  const row = byId ?? await queryFirst<Record<string, unknown>>(db, `
    SELECT bl.*, img.public_url AS hero_public_url, img.kind AS hero_kind
    FROM business_locations bl
    LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
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

export async function listContactSubmissions(db: D1Database, siteId: string) {
  return await queryAll<Record<string, unknown>>(db, `
    SELECT * FROM contact_submissions
    WHERE site_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `, [siteId]);
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
  db: D1Database,
  siteId: string,
  submissionId: string,
  status: string,
  opts: { locationId?: string | null } = {},
) {
  if (!["new", "confirmed", "cancelled", "completed"].includes(status)) {
    throw new Error("Invalid reservation submission status");
  }

  const params = [status, submissionId, siteId]
  let where = `id = ? AND site_id = ?`
  if (opts.locationId) {
    where += ` AND location_id = ?`
    params.push(opts.locationId)
  }
  const result = await execute(db, `
    UPDATE reservation_submissions
    SET status = ?
    WHERE ${where}
  `, params);

  if (!result.meta.changes) throw new Error("Reservation not found");
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
  const sets: string[] = ["updated_at = ?"];
  const params: Array<string | number | null> = [new Date().toISOString()];

  if (updates.question !== undefined) {
    const value = String(updates.question ?? "").trim();
    if (!value) throw new Error("Question is required");
    sets.push("question = ?");
    params.push(value.slice(0, 500));
  }
  if (updates.answer !== undefined) {
    sets.push("answer = ?");
    params.push(stringOrNull(updates.answer, 2000));
  }
  if (updates.question_author !== undefined) {
    sets.push("question_author = ?");
    params.push(stringOrNull(updates.question_author, 120));
  }
  if (updates.is_owner_answer !== undefined) {
    sets.push("is_owner_answer = ?");
    params.push(booleanInt(updates.is_owner_answer));
  }
  if (updates.status !== undefined) {
    const value = String(updates.status);
    if (!["published", "hidden"].includes(value))
      throw new Error("Invalid Q&A status");
    sets.push("status = ?");
    params.push(value);
  }
  if (updates.sort_order !== undefined) {
    const value = Number(updates.sort_order);
    if (!Number.isInteger(value))
      throw new Error("sort_order must be an integer");
    sets.push("sort_order = ?");
    params.push(value);
  }

  if (sets.length === 1) throw new Error("No update fields provided");

  params.push(qaId, locationId, siteId, organizationId);
  const result = await execute(db, `
    UPDATE location_qa
    SET ${sets.join(", ")}
    WHERE id = ? AND location_id = ? AND site_id = ? AND organization_id = ?
  `, params);

  if (!result.meta.changes) throw new Error("Q&A not found");
  return { updated: true, qa_id: qaId };
}

export async function reorderLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  updates: Array<{ id: string; sort_order: number }>,
) {
  if (!updates.length) {
    throw new Error("At least one Q&A update is required");
  }

  const placeholders = updates.map(() => "?").join(", ");
  const validationResult = await queryFirst<{ valid_count: number }>(
    db,
    `SELECT COUNT(*) AS valid_count FROM location_qa
       WHERE id IN (${placeholders}) AND location_id = ? AND site_id = ? AND organization_id = ?`,
    [...updates.map((u) => u.id), locationId, siteId, organizationId],
  );

  const validCount = validationResult?.valid_count ?? 0;
  if (validCount !== updates.length) {
    throw new Error(
      `Q&A reorder failed: ${updates.length - validCount} item(s) not found or do not belong to this location.`,
    );
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const update of updates) {
    const result = await execute(db, `
      UPDATE location_qa
      SET sort_order = ?, updated_at = ?
      WHERE id = ? AND location_id = ? AND site_id = ? AND organization_id = ?
    `, [
      update.sort_order,
      now,
      update.id,
      locationId,
      siteId,
      organizationId,
    ]);
    updated += Number(result.meta.changes ?? 0);
  }

  if (updated !== updates.length) {
    throw new Error(
      `Q&A reorder failed: expected ${updates.length} item(s) to update but only ${updated} matched. Some items may not exist or do not belong to this location.`,
    );
  }

  return { updated };
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

function buildContentId(
  organizationId: string,
  siteId: string,
  page: string,
  field: string,
  locationId?: string,
) {
  return `content::${organizationId}::${siteId}::${locationId ?? "site"}::${page}::${field}`;
}

async function resolvePublicPath(
  db: D1Database,
  siteId: string,
  page: string,
  locationId?: string,
) {
  if (page === "location" && locationId) {
    const location = await queryFirst<{ slug: string }>(db, `
      SELECT slug
      FROM business_locations
      WHERE id = ? AND site_id = ?
      LIMIT 1
    `, [locationId, siteId]);

    return location?.slug ? `/locations/${location.slug}` : "/locations";
  }

  if (page === "menu" && locationId) {
    const location = await queryFirst<{ slug: string }>(db, `
      SELECT slug
      FROM business_locations
      WHERE id = ? AND site_id = ?
      LIMIT 1
    `, [locationId, siteId]);

    return location?.slug ? `/locations/${location.slug}/menu` : "/menu";
  }

  return contentRegistry[page]?.path ?? "/";
}

export async function updatePageContent(
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: {
    page: string;
    changes: Record<string, unknown>;
    location_id?: string | null;
  },
) {
  const locationId = input.location_id ?? undefined;
  const { normalizedFields, heroChange, hasHeroChange } =
    normalizeContentChanges(input.page, input.changes);

  for (const [field, value] of normalizedFields.entries()) {
    const fieldDef = getFieldDef(input.page, field);
    await upsertSiteContent(db, {
      id: buildContentId(organizationId, siteId, input.page, field, locationId),
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
      page: input.page,
      field,
      value,
      type: fieldDef?.type || "text",
      source: "manual",
      content: value,
      hero_title: undefined,
      hero_subtitle: undefined,
      hero_image_asset_id: undefined,
      hero_video_asset_id: undefined,
    });
  }

  if (hasHeroChange) {
    await upsertSiteContent(db, {
      id: buildContentId(
        organizationId,
        siteId,
        input.page,
        "hero",
        locationId,
      ),
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
      page: input.page,
      field: "hero",
      type: "text",
      source: "manual",
      content: undefined,
      updated_at: undefined as never,
      ...(heroChange as Partial<SiteContent>),
    } as Omit<SiteContent, "updated_at">);
  }

  return {
    success: true,
    page: input.page,
    location_id: locationId ?? null,
    changes_count: normalizedFields.size + (hasHeroChange ? 1 : 0),
    public_path: await resolvePublicPath(db, siteId, input.page, locationId),
  };
}

export async function getEditorContent(
  db: D1Database,
  organizationId: string,
  siteId: string,
  page: string,
  locationId?: string,
) {
  const mergedContent = await getPageContent(
    db,
    organizationId,
    siteId,
    page,
    locationId,
  );

  if (page === "location" && locationId) {
    const locHero = await queryFirst<{
      hero_image_asset_id: string | null;
      hero_video_asset_id: string | null;
      hero_public_url: string | null;
      hero_kind: string | null;
      hero_video_public_url: string | null;
      hero_video_kind: string | null;
    }>(db, `
      SELECT bl.hero_image_asset_id, bl.hero_video_asset_id,
             img.public_url AS hero_public_url, img.kind AS hero_kind,
             vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind
      FROM business_locations bl
      LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
      LEFT JOIN media_assets vid ON bl.hero_video_asset_id = vid.id AND vid.status = 'active'
      WHERE bl.id = ? AND bl.site_id = ?
      LIMIT 1
    `, [locationId, siteId]);

    if (locHero) {
      const heroIdx = mergedContent.findIndex(
        (content) => content.field === "hero",
      );
      const existing = heroIdx !== -1 ? mergedContent[heroIdx]! : null;
      const overlaid = {
        id: existing?.id ?? `bl-hero-${locationId}`,
        organization_id: existing?.organization_id ?? organizationId,
        site_id: existing?.site_id ?? siteId,
        location_id: existing?.location_id ?? locationId,
        page: existing?.page ?? page,
        field: "hero",
        type: existing?.type ?? "text",
        source: existing?.source ?? "manual",
        content: existing?.content,
        value: existing?.value,
        hero_title: existing?.hero_title,
        hero_subtitle: existing?.hero_subtitle,
        hero_image_asset_id: locHero.hero_image_asset_id ?? undefined,
        hero_public_url: locHero.hero_public_url ?? null,
        hero_kind: locHero.hero_kind ?? null,
        hero_video_asset_id: locHero.hero_video_asset_id ?? undefined,
        hero_video_public_url: locHero.hero_video_public_url ?? null,
        hero_video_kind: locHero.hero_video_kind ?? null,
        updated_at: existing?.updated_at ?? new Date().toISOString(),
      };
      if (heroIdx !== -1) mergedContent[heroIdx] = overlaid;
      else mergedContent.push(overlaid);
    }
  }

  const editableKeys = editableFieldKeys(page);
  const content = mergedContent.map((item) => {
    const isStructuredHero = item.field === "hero";
    const isEditableField =
      isStructuredHero || Boolean(getFieldDef(page, item.field));
    return {
      ...item,
      render_status: isEditableField ? "rendered" : "orphan",
      editable_keys: isStructuredHero
        ? ["hero.title", "hero.subtitle", "hero.image", "hero.video"]
        : getFieldDef(page, item.field)
          ? [item.field]
          : [],
    };
  });

  return {
    fields: content,
    siteId,
    locationId,
    page,
    public_path: await resolvePublicPath(db, siteId, page, locationId),
    schema: {
      page,
      fields: editableKeys,
      structured: ["hero.title", "hero.subtitle", "hero.image", "hero.video"],
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
    image_asset_id?: string | null;
    video_asset_id?: string | null;
    location_id?: string | null;
  },
) {
  const changes: Record<string, unknown> = {
    hero: {
      ...(input.title !== undefined ? { hero_title: input.title ?? "" } : {}),
      ...(input.subtitle !== undefined
        ? { hero_subtitle: input.subtitle ?? "" }
        : {}),
      ...(input.image_asset_id !== undefined
        ? { hero_image_asset_id: input.image_asset_id }
        : {}),
      ...(input.video_asset_id !== undefined
        ? { hero_video_asset_id: input.video_asset_id }
        : {}),
    },
  };

  const result = await updatePageContent(db, organizationId, siteId, {
    page: "home",
    changes,
    location_id: input.location_id,
  });

  return {
    success: true,
    page: "home",
    changes_count: result.changes_count,
    public_path: result.public_path,
  };
}

export async function hydrateSeededLocationForOnboarding(
  db: D1Database,
  organizationId: string,
  siteId: string,
  userId: string,
  updates: Record<string, unknown>,
) {
  const locations = await queryAll<{ id: string; slug: string }>(db, `
    SELECT id, slug
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
) {
  const locationId = input.location_id ?? undefined;
  await deleteSiteContentField(
    db,
    organizationId,
    siteId,
    input.page,
    input.field,
    locationId,
  );
  return {
    deleted: true,
    page: input.page,
    field: input.field,
    public_path: await resolvePublicPath(db, siteId, input.page, locationId),
  };
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

function stringOrNull(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function booleanInt(value: unknown) {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  throw new Error("Boolean value required");
}
