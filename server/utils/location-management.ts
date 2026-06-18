import { updateSubscriptionQuantity } from "~/server/utils/billing";

type SetupEnv = Record<string, string | undefined>;

const MAX_SLUG_ATTEMPTS = 10;

export interface CreateLocationInput {
  title: string;
  slug?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  maps_url?: string | null;
  google_place_id?: string | null;
  description?: string | null;
  short_description?: string | null;
  address?: string | Record<string, unknown> | null;
  opening_hours?: string | unknown[] | Record<string, unknown> | null;
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
  is_primary?: boolean;
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
  google_place_id: string | null;
  rating: number | null;
  review_count: number | null;
  description: string | null;
  short_description: string | null;
  status: string;
  is_primary: number | boolean;
  address?: string | null;
  opening_hours?: string | null;
  hero_image_asset_id?: string | null;
  hero_video_asset_id?: string | null;
  price_level?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  grab_url?: string | null;
  uber_eats_url?: string | null;
  foodpanda_url?: string | null;
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
  const addressLines = normalizeAddressLines(value);
  return addressLines.length ? JSON.stringify({ addressLines }) : null;
}

function serializeOpeningHours(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    if (!isPlainObject(value) && !Array.isArray(value)) return null;
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

async function validateMediaAsset(
  db: D1Database,
  organizationId: string,
  siteId: string,
  assetId: string | null | undefined,
  kind: "image" | "video",
  fieldName: string,
) {
  if (!assetId) return;
  const asset = await db
    .prepare(
      `
    SELECT id
    FROM media_assets
    WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active' AND kind = ?
    LIMIT 1
  `,
    )
    .bind(assetId, organizationId, siteId, kind)
    .first();

  if (!asset) {
    throw new Error(`${fieldName} not found, unauthorized, or not a ${kind}`);
  }
}

async function loadLocation(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
) {
  return db
    .prepare(
      `
    SELECT id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_place_id,
           rating, review_count, description, short_description, status, is_primary,
           address, opening_hours, hero_image_asset_id, hero_video_asset_id, price_level,
           facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
           created_at, updated_at
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `,
    )
    .bind(locationId, organizationId, siteId)
    .first<LocationRecord>();
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
  } catch (error) {
    return {
      status: 400,
      data: {
        error: error instanceof Error ? error.message : "Invalid media asset.",
      },
    };
  }

  const activeCountRow = await db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM business_locations
    WHERE organization_id = ? AND site_id = ? AND status = 'active'
  `,
    )
    .bind(organizationId, siteId)
    .first<{ count: number | string }>();

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
      const statements: D1PreparedStatement[] = [];
      if (isPrimary) {
        statements.push(
          db
            .prepare(
              `
            UPDATE business_locations
            SET is_primary = 0, updated_at = ?
            WHERE organization_id = ? AND site_id = ?
          `,
            )
            .bind(now, organizationId, siteId),
        );
      }

      statements.push(
        db
          .prepare(
            `
          INSERT INTO business_locations (
            id, organization_id, site_id, title, slug, city, neighborhood, phone, email, website_url, maps_url,
            google_place_id, description, short_description, address, opening_hours, rating, review_count,
            price_level, facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
            hero_image_asset_id, hero_video_asset_id, is_primary, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `,
          )
          .bind(
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
            input.google_place_id ?? null,
            input.description ?? null,
            input.short_description ?? null,
            serializeAddress(input.address),
            serializeOpeningHours(input.opening_hours),
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
            isPrimary ? 1 : 0,
            now,
            now,
          ),
      );

      if (isPrimary) {
        statements.push(
          db
            .prepare(
              `
            UPDATE sites
            SET primary_location_id = ?, updated_at = ?, updated_by = ?
            WHERE id = ? AND organization_id = ?
          `,
            )
            .bind(id, now, userId, siteId, organizationId),
        );
      }

      await db.batch(statements);
      const location = await loadLocation(db, organizationId, siteId, id);
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
  locationId: string,
  input: UpdateLocationInput,
  userId: string,
) {
  const existing = await loadLocation(db, organizationId, siteId, locationId);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }

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
  } catch (error) {
    return {
      status: 400,
      data: {
        error: error instanceof Error ? error.message : "Invalid media asset.",
      },
    };
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
    "google_place_id",
    "hero_image_asset_id",
    "hero_video_asset_id",
    "status",
  ] as const;

  for (const field of simpleFields) {
    if (input[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(input[field] ?? null);
    }
  }

  if (input.address !== undefined) {
    sets.push("address = ?");
    params.push(serializeAddress(input.address));
  }
  if (input.opening_hours !== undefined) {
    sets.push("opening_hours = ?");
    params.push(serializeOpeningHours(input.opening_hours));
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
    const statements: D1PreparedStatement[] = [];
    if (input.is_primary === true) {
      statements.push(
        db
          .prepare(
            `
          UPDATE business_locations
          SET is_primary = 0, updated_at = ?
          WHERE organization_id = ? AND site_id = ?
        `,
          )
          .bind(now, organizationId, siteId),
      );
      statements.push(
        db
          .prepare(
            `
          UPDATE sites
          SET primary_location_id = ?, updated_at = ?, updated_by = ?
          WHERE id = ? AND organization_id = ?
        `,
          )
          .bind(locationId, now, userId, siteId, organizationId),
      );
    } else if (input.is_primary === false) {
      statements.push(
        db
          .prepare(
            `
          UPDATE sites
          SET primary_location_id = NULL, updated_at = ?, updated_by = ?
          WHERE id = ? AND organization_id = ? AND primary_location_id = ?
        `,
          )
          .bind(now, userId, siteId, organizationId, locationId),
      );
    }

    statements.push(
      db
        .prepare(
          `
        UPDATE business_locations
        SET ${sets.join(", ")}
        WHERE id = ? AND organization_id = ? AND site_id = ?
      `,
        )
        .bind(...boundParams),
    );

    await db.batch(statements);
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
  return { status: 200, data: { success: true, location } };
}

export async function deleteLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  userId: string,
) {
  // A location delete can cascade SET NULL into Google Business rows. If the
  // site already has a site-level connection, that null transition can collide
  // with the partial unique index on google_business_connections.
  // Remove location-scoped connections up front so the hard delete stays
  // deterministic and does not depend on SQLite's constraint ordering.
  const statements = [
    db
      .prepare(
        `
      UPDATE media_assets
      SET location_id = NULL
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      )
      .bind(organizationId, siteId, locationId),
    db
      .prepare(
        `
      DELETE FROM google_business_connections
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      )
      .bind(organizationId, siteId, locationId),
    db
      .prepare(
        `
      DELETE FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
    `,
      )
      .bind(locationId, organizationId, siteId),
  ];

  const batchResults = await db.batch(statements);
  const deleteResult = batchResults[2];

  if (!deleteResult?.meta.changes) {
    return { status: 404, data: { error: "Location not found." } };
  }

  await db
    .prepare(
      `
    UPDATE sites
    SET primary_location_id = NULL, updated_at = ?, updated_by = ?
    WHERE id = ? AND organization_id = ? AND primary_location_id = ?
  `,
    )
    .bind(new Date().toISOString(), userId, siteId, organizationId, locationId)
    .run();

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
