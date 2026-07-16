import { updateSubscriptionQuantity } from "~/server/utils/billing";
import { fireSiteEventSafe } from "~/server/utils/site-events";
import { execute, executeBatch, queryFirst, type DbClient } from "~/server/db";
import { isValidTimezone, normalizeTimezone } from "~/utils/timezone";
import { parsePhone } from "~/utils/phone";

// Require format-valid E.164 at the shared location write boundary (issue
// #293 Section D/I) — this is the one place createLocation/updateLocation
// both funnel through, so it also covers callers that don't go through the
// dashboard HTTP routes (e.g. MCP/ChowBot's create_location/update_location
// tools in server/utils/mcp-executor/locations.ts), which previously wrote
// input.notification_phone straight to the column with no validation at all.
export function normalizeLocationNotificationPhone(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || !raw.trim()) return null;
  const parsed = parsePhone(raw, { defaultCountry: "TH" });
  if (!parsed.valid || !parsed.e164) {
    throw new Error("notification_phone must be a valid phone number, including country code.");
  }
  return parsed.e164;
}

type SetupEnv = Record<string, string | undefined>;

const MAX_SLUG_ATTEMPTS = 10;

export interface SpecialHoursInput {
  closed: boolean;
  starts_on?: string | null;
  ends_on?: string | null;
  note?: string | null;
}

export interface CreateLocationInput {
  title: string;
  slug?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  maps_url?: string | null;
  google_review_url?: string | null;
  google_place_id?: string | null;
  description?: string | null;
  short_description?: string | null;
  address?: string | Record<string, unknown> | null;
  opening_hours?: string | unknown[] | Record<string, unknown> | null;
  special_hours?: SpecialHoursInput | null;
  price_level?: string | null;
  rating?: number | null;
  review_count?: number | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  grab_url?: string | null;
  uber_eats_url?: string | null;
  foodpanda_url?: string | null;
  hero_image_asset_id?: string | null;
  hero_video_asset_id?: string | null;
  notification_phone?: string | null;
  timezone?: string | null;
  max_capacity?: number | null;
  is_primary?: boolean;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  og_image_asset_id?: string | null;
}

export interface UpdateLocationInput extends Partial<CreateLocationInput> {
  status?: "active" | "inactive" | "sync_error";
}

export interface LocationRecord {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  maps_url: string | null;
  google_review_url: string | null;
  google_place_id: string | null;
  rating: number | null;
  review_count: number | null;
  description: string | null;
  short_description: string | null;
  status: string;
  is_primary: number | boolean;
  address?: string | null;
  opening_hours?: string | null;
  special_hours?: string | null;
  hero_image_asset_id?: string | null;
  hero_video_asset_id?: string | null;
  price_level?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  grab_url?: string | null;
  uber_eats_url?: string | null;
  foodpanda_url?: string | null;
  notification_phone?: string | null;
  timezone?: string | null;
  max_capacity?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  og_image_asset_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

function toSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (normalized) return normalized;

  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `location-${hash.toString(36) || "0"}`;
}

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /UNIQUE constraint failed/i.test(message);
}

function normalizeOrderingUrl(value: string | null | undefined, field: string) {
  if (value === undefined || value === null || value === "") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid protocol");
    }
    return url.toString();
  } catch {
    throw new Error(`${field} must be a valid http:// or https:// URL`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAddressLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function serializeAddress(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    if (!isPlainObject(value) && !Array.isArray(value)) return null;
    return JSON.stringify(value);
  }
  // Callers sometimes pre-stringify an already-structured address (e.g. round-tripping
  // a value read from this same column) before passing it in here. Detect that case and
  // pass it through rather than re-wrapping the JSON text as a literal address line,
  // which previously produced double-encoded JSON (e.g. {"addressLines":["{\"addressLines\":...}"]}).
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isPlainObject(parsed) || Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      // Not valid JSON — fall through and treat as freeform address text.
    }
  }
  const addressLines = normalizeAddressLines(value);
  return addressLines.length ? JSON.stringify({ addressLines }) : null;
}

function serializeOpeningHours(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    // Google Places returns a bare weekdayDescriptions string[] — normalize to the
    // same { weekdayDescriptions } shape consumers (dashboard hours editor, public
    // site hours rendering) expect regardless of input source.
    if (Array.isArray(value)) {
      if (!value.every((item) => typeof item === "string")) {
        throw new Error(
          "opening_hours array must contain only strings (one per line, e.g. \"Monday: 9:00 AM – 5:00 PM\"). " +
            "To pass structured hours, use { weekdayDescriptions: string[] } instead.",
        );
      }
      return value.length ? JSON.stringify({ weekdayDescriptions: value }) : null;
    }
    if (!isPlainObject(value)) {
      throw new Error(
        "opening_hours must be a string, a string[], or an object like { weekdayDescriptions: string[] }.",
      );
    }
    return JSON.stringify(value);
  }
  const weekdayDescriptions = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return weekdayDescriptions.length
    ? JSON.stringify({ weekdayDescriptions })
    : null;
}

function parseYmd(value: string, field: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`${field} must be a date in YYYY-MM-DD format.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
  return { year, month, day };
}

function serializeSpecialHours(value: SpecialHoursInput | null | undefined) {
  if (value === undefined || value === null) return null;

  const startsOn = value.starts_on ? parseYmd(value.starts_on, "special_hours.starts_on") : null;
  const endsOn = value.ends_on ? parseYmd(value.ends_on, "special_hours.ends_on") : null;
  const today = new Date();
  const startDate = startsOn ?? {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };

  if (endsOn) {
    const startMs = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
    const endMs = Date.UTC(endsOn.year, endsOn.month - 1, endsOn.day);
    if (endMs < startMs) {
      throw new Error("special_hours.ends_on must not be before starts_on.");
    }
  }

  const note = typeof value.note === "string" ? value.note.trim() || undefined : undefined;

  return JSON.stringify({
    specialHourPeriods: [
      {
        startDate,
        ...(endsOn ? { endDate: endsOn } : {}),
        isClosed: Boolean(value.closed),
        ...(note ? { note } : {}),
      },
    ],
  });
}

export async function validateMediaAsset(
  db: DbClient,
  organizationId: string,
  siteId: string,
  assetId: string | null | undefined,
  kind: "image" | "video",
  fieldName: string,
) {
  if (!assetId) return;
  const asset = await queryFirst(
    db,
    `
    SELECT id
    FROM media_assets
    WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active' AND kind = ?
    LIMIT 1
  `,
    [assetId, organizationId, siteId, kind],
  );

  if (!asset) {
    throw new Error(`${fieldName} not found, unauthorized, or not a ${kind}`);
  }
}

async function loadLocation(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const columns = `id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_review_url, google_place_id,
           rating, review_count, description, short_description, status, is_primary,
           address, opening_hours, special_hours, hero_image_asset_id, hero_video_asset_id, price_level,
           facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
           notification_phone, timezone, max_capacity, seo_title, seo_description, canonical_url, robots, og_image_asset_id,
           created_at, updated_at`;
  // Check id first so a slug that happens to collide with another row's id can
  // never shadow the row actually addressed by that id.
  const byId = await queryFirst<LocationRecord>(
    db,
    `SELECT ${columns} FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [locationIdOrSlug, organizationId, siteId],
  );
  if (byId) return byId;
  return queryFirst<LocationRecord>(
    db,
    `SELECT ${columns} FROM business_locations WHERE slug = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [locationIdOrSlug, organizationId, siteId],
  );
}

export async function createLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  input: CreateLocationInput,
  userId: string,
) {
  const title = input.title.trim();
  if (!title) {
    return { status: 400, data: { error: "Location title is required." } };
  }

  if (
    input.rating !== undefined &&
    input.rating !== null &&
    (input.rating < 0 || input.rating > 5)
  ) {
    return { status: 400, data: { error: "rating must be between 0 and 5." } };
  }
  if (
    input.review_count !== undefined &&
    input.review_count !== null &&
    (!Number.isInteger(input.review_count) || input.review_count < 0)
  ) {
    return {
      status: 400,
      data: {
        error:
          "review_count must be a whole number greater than or equal to 0.",
      },
    };
  }
  if (
    input.max_capacity !== undefined &&
    input.max_capacity !== null &&
    (!Number.isInteger(input.max_capacity) || input.max_capacity < 0)
  ) {
    return {
      status: 400,
      data: {
        error:
          "max_capacity must be a whole number greater than or equal to 0.",
      },
    };
  }
  const normalizedTimezone = input.timezone === undefined
    ? undefined
    : normalizeTimezone(input.timezone);

  if (normalizedTimezone !== undefined && normalizedTimezone !== null && !isValidTimezone(normalizedTimezone)) {
    return {
      status: 400,
      data: { error: "timezone must be a valid IANA time zone identifier." },
    };
  }

  let normalizedNotificationPhone: string | null;
  try {
    normalizedNotificationPhone = normalizeLocationNotificationPhone(input.notification_phone);
  } catch (error) {
    return {
      status: 400,
      data: { error: error instanceof Error ? error.message : "Invalid notification_phone." },
    };
  }

  try {
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.hero_image_asset_id,
      "image",
      "hero_image_asset_id",
    );
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.hero_video_asset_id,
      "video",
      "hero_video_asset_id",
    );
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.og_image_asset_id,
      "image",
      "og_image_asset_id",
    );
  } catch (error) {
    return {
      status: 400,
      data: {
        error: error instanceof Error ? error.message : "Invalid media asset.",
      },
    };
  }

  const activeCountRow = await queryFirst<{ count: number | string }>(
    db,
    `
    SELECT COUNT(*) AS count
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
  `,
    [organizationId, siteId],
  );

  const activeCount = Number(activeCountRow?.count ?? 0);
  if (!Number.isFinite(activeCount)) {
    return {
      status: 500,
      data: { error: "Unable to verify active locations." },
    };
  }

  const baseSlug = toSlug((input.slug ?? title).trim());
  const isPrimary = input.is_primary === true || activeCount === 0;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    try {
      const statements: { query: string; params: unknown[] }[] = [];
      if (isPrimary) {
        statements.push({
          query: `
            UPDATE business_locations
            SET is_primary = 0, updated_at = ?
            WHERE organization_id = ? AND site_id = ?
          `,
          params: [now, organizationId, siteId],
        });
      }

      statements.push({
        query: `
          INSERT INTO business_locations (
            id, organization_id, site_id, title, slug, city, neighborhood, phone, email, website_url, maps_url,
            google_review_url, google_place_id, description, short_description, address, opening_hours, special_hours, rating, review_count,
            price_level, facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
            hero_image_asset_id, hero_video_asset_id, notification_phone, timezone, max_capacity, is_primary, status,
            seo_title, seo_description, canonical_url, robots, og_image_asset_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          id,
          organizationId,
          siteId,
          title,
          slug,
          input.city ?? null,
          input.neighborhood ?? null,
          input.phone ?? null,
          input.email ?? null,
          input.website_url ?? null,
          input.maps_url ?? null,
          input.google_review_url ?? null,
          input.google_place_id ?? null,
          input.description ?? null,
          input.short_description ?? null,
          serializeAddress(input.address),
          serializeOpeningHours(input.opening_hours),
          serializeSpecialHours(input.special_hours),
          input.rating ?? null,
          input.review_count ?? null,
          input.price_level ?? null,
          input.facebook_url ?? null,
          input.instagram_url ?? null,
          input.tiktok_url ?? null,
          normalizeOrderingUrl(input.grab_url, "grab_url"),
          normalizeOrderingUrl(input.uber_eats_url, "uber_eats_url"),
          normalizeOrderingUrl(input.foodpanda_url, "foodpanda_url"),
          input.hero_image_asset_id ?? null,
          input.hero_video_asset_id ?? null,
          normalizedNotificationPhone,
          normalizedTimezone ?? null,
          input.max_capacity ?? null,
          isPrimary ? 1 : 0,
          input.seo_title ?? null,
          input.seo_description ?? null,
          input.canonical_url ?? null,
          input.robots ?? null,
          input.og_image_asset_id ?? null,
          now,
          now,
        ],
      });

      if (isPrimary) {
        statements.push({
          query: `
            UPDATE sites
            SET primary_location_id = ?, updated_at = ?, updated_by = ?
            WHERE id = ? AND organization_id = ?
          `,
          params: [id, now, userId, siteId, organizationId],
        });
      }

      await executeBatch(db, statements);
      const location = await loadLocation(db, organizationId, siteId, id);
      await fireSiteEventSafe({
        db,
        organizationId,
        siteId,
        locationId: id,
        actorId: userId,
        eventType: "location.created",
        entityType: "business_location",
        entityId: id,
        metadata: {
          title,
          is_primary: isPrimary,
        },
      })
      void updateSubscriptionQuantity(env, db, organizationId).catch(
        (error) => {
          console.error(
            "Failed to update Stripe subscription quantity after location create:",
            error,
          );
        },
      );
      return { status: 201, data: { success: true, location } };
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      if (error instanceof Error) {
        return { status: 400, data: { error: error.message } };
      }
      throw error;
    }
  }

  return {
    status: 409,
    data: {
      error: `Unable to allocate a unique location slug after ${MAX_SLUG_ATTEMPTS} attempts.`,
    },
  };
}

export async function updateLocation(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
  input: UpdateLocationInput,
  userId: string,
) {
  const existing = await loadLocation(db, organizationId, siteId, locationIdOrSlug);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }
  // Every other reference to locationId below must use the canonical row id,
  // never the raw locationIdOrSlug — site_id/sites.primary_location_id and the
  // final UPDATE's WHERE clause are matched against the real id.
  const locationId = existing.id;

  if (Object.keys(input).length === 0) {
    return { status: 400, data: { error: "No update fields provided." } };
  }

  if (input.title !== undefined && !input.title.trim()) {
    return { status: 400, data: { error: "title cannot be empty." } };
  }
  if (
    input.rating !== undefined &&
    input.rating !== null &&
    (input.rating < 0 || input.rating > 5)
  ) {
    return { status: 400, data: { error: "rating must be between 0 and 5." } };
  }
  if (
    input.review_count !== undefined &&
    input.review_count !== null &&
    (!Number.isInteger(input.review_count) || input.review_count < 0)
  ) {
    return {
      status: 400,
      data: {
        error:
          "review_count must be a whole number greater than or equal to 0.",
      },
    };
  }
  if (
    input.max_capacity !== undefined &&
    input.max_capacity !== null &&
    (!Number.isInteger(input.max_capacity) || input.max_capacity < 0)
  ) {
    return {
      status: 400,
      data: {
        error:
          "max_capacity must be a whole number greater than or equal to 0.",
      },
    };
  }
  const normalizedTimezone = input.timezone === undefined
    ? undefined
    : normalizeTimezone(input.timezone);

  if (normalizedTimezone !== undefined && normalizedTimezone !== null && !isValidTimezone(normalizedTimezone)) {
    return {
      status: 400,
      data: { error: "timezone must be a valid IANA time zone identifier." },
    };
  }

  try {
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.hero_image_asset_id,
      "image",
      "hero_image_asset_id",
    );
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.hero_video_asset_id,
      "video",
      "hero_video_asset_id",
    );
    await validateMediaAsset(
      db,
      organizationId,
      siteId,
      input.og_image_asset_id,
      "image",
      "og_image_asset_id",
    );
  } catch (error) {
    return {
      status: 400,
      data: {
        error: error instanceof Error ? error.message : "Invalid media asset.",
      },
    };
  }

  let normalizedNotificationPhone: string | null | undefined;
  if (input.notification_phone !== undefined) {
    try {
      normalizedNotificationPhone = normalizeLocationNotificationPhone(input.notification_phone);
    } catch (error) {
      return {
        status: 400,
        data: { error: error instanceof Error ? error.message : "Invalid notification_phone." },
      };
    }
  }

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: Array<string | number | null> = [now];
  let slugParamIndex: number | null = null;
  let slugBase: string | null = null;

  if (input.title !== undefined) {
    sets.push("title = ?", "slug = ?");
    params.push(input.title.trim(), toSlug((input.slug ?? input.title).trim()));
    slugParamIndex = params.length - 1;
    slugBase = String(params[slugParamIndex]);
  } else if (input.slug !== undefined && input.slug !== null) {
    sets.push("slug = ?");
    params.push(toSlug(input.slug.trim()));
    slugParamIndex = params.length - 1;
    slugBase = String(params[slugParamIndex]);
  }

  const simpleFields = [
    "city",
    "neighborhood",
    "phone",
    "email",
    "description",
    "short_description",
    "price_level",
    "facebook_url",
    "instagram_url",
    "tiktok_url",
    "website_url",
    "maps_url",
    "google_review_url",
    "google_place_id",
    "hero_image_asset_id",
    "hero_video_asset_id",
    "notification_phone",
    "timezone",
    "max_capacity",
    "status",
    "seo_title",
    "seo_description",
    "canonical_url",
    "robots",
    "og_image_asset_id",
  ] as const;

  for (const field of simpleFields) {
    if (input[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(
        field === "timezone"
          ? normalizedTimezone ?? null
          : field === "notification_phone"
            ? normalizedNotificationPhone ?? null
            : input[field] ?? null,
      );
    }
  }

  if (input.address !== undefined) {
    sets.push("address = ?");
    params.push(serializeAddress(input.address));
  }
  if (input.opening_hours !== undefined) {
    try {
      sets.push("opening_hours = ?");
      params.push(serializeOpeningHours(input.opening_hours));
    } catch (error) {
      return {
        status: 400,
        data: {
          error:
            error instanceof Error ? error.message : "Invalid opening_hours.",
        },
      };
    }
  }
  if (input.special_hours !== undefined) {
    try {
      sets.push("special_hours = ?");
      params.push(serializeSpecialHours(input.special_hours));
    } catch (error) {
      return {
        status: 400,
        data: {
          error:
            error instanceof Error ? error.message : "Invalid special_hours.",
        },
      };
    }
  }
  if (input.rating !== undefined) {
    sets.push("rating = ?");
    params.push(input.rating ?? null);
  }
  if (input.review_count !== undefined) {
    sets.push("review_count = ?");
    params.push(input.review_count ?? null);
  }
  if (input.grab_url !== undefined) {
    try {
      sets.push("grab_url = ?");
      params.push(normalizeOrderingUrl(input.grab_url, "grab_url"));
    } catch (error) {
      return {
        status: 400,
        data: {
          error: error instanceof Error ? error.message : "Invalid grab_url.",
        },
      };
    }
  }
  if (input.uber_eats_url !== undefined) {
    try {
      sets.push("uber_eats_url = ?");
      params.push(normalizeOrderingUrl(input.uber_eats_url, "uber_eats_url"));
    } catch (error) {
      return {
        status: 400,
        data: {
          error:
            error instanceof Error ? error.message : "Invalid uber_eats_url.",
        },
      };
    }
  }
  if (input.foodpanda_url !== undefined) {
    try {
      sets.push("foodpanda_url = ?");
      params.push(normalizeOrderingUrl(input.foodpanda_url, "foodpanda_url"));
    } catch (error) {
      return {
        status: 400,
        data: {
          error:
            error instanceof Error ? error.message : "Invalid foodpanda_url.",
        },
      };
    }
  }
  if (input.is_primary !== undefined) {
    sets.push("is_primary = ?");
    params.push(input.is_primary ? 1 : 0);
  }

  const runUpdate = async (boundParams: Array<string | number | null>) => {
    const statements: { query: string; params: unknown[] }[] = [];
    if (input.is_primary === true) {
      statements.push({
        query: `
          UPDATE business_locations
          SET is_primary = 0, updated_at = ?
          WHERE organization_id = ? AND site_id = ?
        `,
        params: [now, organizationId, siteId],
      });
      statements.push({
        query: `
          UPDATE sites
          SET primary_location_id = ?, updated_at = ?, updated_by = ?
          WHERE id = ? AND organization_id = ?
        `,
        params: [locationId, now, userId, siteId, organizationId],
      });
    } else if (input.is_primary === false) {
      statements.push({
        query: `
          UPDATE sites
          SET primary_location_id = NULL, updated_at = ?, updated_by = ?
          WHERE id = ? AND organization_id = ? AND primary_location_id = ?
        `,
        params: [now, userId, siteId, organizationId, locationId],
      });
    }

    statements.push({
      query: `
        UPDATE business_locations
        SET ${sets.join(", ")}
        WHERE id = ? AND organization_id = ? AND site_id = ?
      `,
      params: boundParams,
    });

    await executeBatch(db, statements);
  };

  if (slugBase && slugParamIndex !== null) {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt + 1}`;
      const boundParams = [...params];
      boundParams[slugParamIndex] = slug;
      boundParams.push(locationId, organizationId, siteId);
      try {
        await runUpdate(boundParams);
        const location = await loadLocation(
          db,
          organizationId,
          siteId,
          locationId,
        );
        await fireSiteEventSafe({
          db,
          organizationId,
          siteId,
          locationId,
          actorId: userId,
          eventType: "location.updated",
          entityType: "business_location",
          entityId: locationId,
          metadata: {
            title: location?.title ?? null,
          },
        })
        return { status: 200, data: { success: true, location } };
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        if (error instanceof Error) {
          return { status: 400, data: { error: error.message } };
        }
        throw error;
      }
    }

    return {
      status: 409,
      data: {
        error: `Unable to allocate a unique location slug after ${MAX_SLUG_ATTEMPTS} attempts.`,
      },
    };
  }

  params.push(locationId, organizationId, siteId);
  await runUpdate(params);
  const location = await loadLocation(db, organizationId, siteId, locationId);
  await fireSiteEventSafe({
    db,
    organizationId,
    siteId,
    locationId,
    actorId: userId,
    eventType: "location.updated",
    entityType: "business_location",
    entityId: locationId,
    metadata: {
      title: location?.title ?? null,
    },
  })
  return { status: 200, data: { success: true, location } };
}

export async function deleteLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
  userId: string,
) {
  const existing = await loadLocation(db, organizationId, siteId, locationIdOrSlug);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }
  const locationId = existing.id;
  const now = new Date().toISOString();
  // A location delete can cascade SET NULL into Google Business rows. If the
  // site already has a site-level connection, that null transition can collide
  // with the partial unique index on google_business_connections.
  // Also clear saved workspace selections up front so every surface observes
  // the same delete contract even if an environment is missing/on-disk foreign
  // key metadata from an older local DB snapshot.
  // Remove location-scoped connections and pointers up front so the hard delete
  // stays deterministic and does not depend on SQLite's constraint ordering.
  const statements = [
    {
      query: `
      UPDATE media_assets
      SET location_id = NULL
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      params: [organizationId, siteId, locationId],
    },
    {
      query: `
      UPDATE dashboard_preferences
      SET selected_location_id = NULL,
          updated_at = ?
      WHERE organization_id = ? AND selected_location_id = ?
    `,
      params: [now, organizationId, locationId],
    },
    {
      query: `
      UPDATE mcp_workspace_preferences
      SET location_id = NULL,
          updated_at = ?
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      params: [now, organizationId, siteId, locationId],
    },
    {
      query: `
      UPDATE chowbot_conversations
      SET selected_location_id = NULL,
          updated_at = ?
      WHERE organization_id = ? AND site_id = ? AND selected_location_id = ?
    `,
      params: [now, organizationId, siteId, locationId],
    },
    {
      query: `
      DELETE FROM google_business_connections
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      params: [organizationId, siteId, locationId],
    },
    {
      query: `
      DELETE FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
    `,
      params: [locationId, organizationId, siteId],
    },
  ];

  const batchResults = await executeBatch(db, statements);
  const deleteResult = batchResults[5];

  if (!deleteResult?.meta.changes) {
    return { status: 404, data: { error: "Location not found." } };
  }

  await execute(
    db,
    `
    UPDATE sites
    SET primary_location_id = NULL, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND primary_location_id = ?
  `,
    [now, userId, siteId, organizationId, locationId],
  );

  void updateSubscriptionQuantity(env, db, organizationId).catch((error) => {
    console.error(
      "Failed to update Stripe subscription quantity after location delete:",
      error,
    );
  });

  return {
    status: 200,
    data: { success: true, location_id: locationId, deleted: true },
  };
}
