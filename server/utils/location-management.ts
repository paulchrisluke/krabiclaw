import { parsePostalAddress, type PostalAddress } from '~/utils/postal-address'
import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import { fireOrganizationEvent } from "~/server/utils/organization-events";
import { executeBatch, queryFirst } from "~/server/db";
import { isValidTimezone, normalizeTimezone } from "~/utils/timezone";
import type { CmsCapabilityOverrideDelta, ProductFeature } from "~/config/cms-registry";
import { resolveSiteCmsCapabilities } from "~/server/utils/cms-capabilities";
import { checkModuleHasLiveData } from "~/server/utils/module-content-guard";
import type { CloudflareEnv } from "~/server/utils/auth";
import { refreshSocialCard } from '~/server/utils/social-card'
import { resourceLocalizationDeletionQueries } from '~/server/utils/localization'
import { prepareContentDocumentDeletion } from '~/server/utils/content/documents'

type SetupEnv = CloudflareEnv;

const MAX_SLUG_ATTEMPTS = 10;



export interface CreateLocationInput {
  title: string;
  slug?: string | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  maps_url?: string | null;
  google_review_url?: string | null;
  google_place_id?: string | null;
  description?: string | null;
  short_description?: string | null;
  address?: PostalAddress | null;
  opening_hours?: OpeningHours;
  special_hours?: SpecialHours;
  price_level?: string | null;
  rating?: number | null;
  review_count?: number | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  timezone?: string | null;
  max_capacity?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  // Additive/subtractive delta layered on top of the parent site's effective feature set
  // (config/cms-registry.ts) — null clears the override back to pure inheritance. `enabled`
  // entries must be a subset of the site's effective feature set; validated below.
  feature_overrides?: CmsCapabilityOverrideDelta | null;
}

export interface UpdateLocationInput extends Partial<CreateLocationInput> {
  status?: "active" | "inactive" | "sync_error";
}

export interface LocationRecord {
  id: string;
  slug: string;
  title: string;
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
  address?: string | null;
  categories?: string | null;
  opening_hours?: string | null;
  special_hours?: string | null;
  price_level?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  timezone?: string | null;
  max_capacity?: number | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  feature_overrides?: string | null;
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

export function serializeOpeningHours(value: unknown): string | null {
  const hours = parseOpeningHours(value ?? null)
  return hours === null ? null : JSON.stringify(hours)
}

function serializeSpecialHours(value: unknown): string | null {
  const hours = parseSpecialHours(value ?? null)
  return hours === null ? null : JSON.stringify(hours)
}

interface LocationFeaturesValidationError {
  ok: false;
  status: number;
  data: { error: string };
}

// Shared by createLocation and updateLocation: looks up the parent site, resolves its effective
// feature set, and validates a submitted feature_overrides delta against it. Preserves the
// undefined/null distinction on the way out — undefined means "field not touched" (matters for
// updateLocation's partial-update SET-clause gating), null means "explicit clear back to
// inheriting the site's effective features", both `createLocation` and `updateLocation` map the
// result onto their own return shape. `locationId` is only passed by updateLocation (a location
// being created has no existing content to guard) — when present, a `disabled` module with live
// content at this location is rejected rather than silently hidden.
async function resolveValidatedLocationFeatures(
  db: D1Database,
  organizationId: string,
  featureOverrides: CmsCapabilityOverrideDelta | null | undefined,
  locationId?: string,
): Promise<{ ok: true; normalized: string | null | undefined } | LocationFeaturesValidationError> {
  if (featureOverrides === undefined) {
    return { ok: true, normalized: undefined };
  }
  if (featureOverrides === null) {
    return { ok: true, normalized: null };
  }
  const { enabled = [], disabled = [] } = featureOverrides;
  if (!Array.isArray(enabled) || !enabled.every((value) => typeof value === "string") || !Array.isArray(disabled) || !disabled.every((value) => typeof value === "string")) {
    return { ok: false, status: 400, data: { error: "feature_overrides.enabled/disabled must be arrays of feature ids or null." } };
  }
  const parentSite = await queryFirst<{ vertical: string; theme_id: string; feature_overrides: string | null }>(db, `
    SELECT vertical, theme_id, feature_overrides FROM organization WHERE id = ? LIMIT 1
  `, [organizationId]);
  if (!parentSite) {
    return { ok: false, status: 404, data: { error: "Site not found." } };
  }
  let siteEffectiveFeatures: readonly ProductFeature[] = [];
  let toggleableAtLocation: readonly ProductFeature[] = [];
  try {
    const { template, capabilities } = resolveSiteCmsCapabilities(parentSite.vertical, parentSite.theme_id, { siteEnabledFeatures: parentSite.feature_overrides });
    siteEffectiveFeatures = [...new Set([...capabilities.pages.map((p) => p.feature), ...capabilities.managers.map((m) => m.id)])];
    const { toggleableModulesForScope } = await import("~/config/cms-registry");
    toggleableAtLocation = toggleableModulesForScope(template, "location");
  } catch {
    return { ok: false, status: 422, data: { error: "Unsupported site vertical/template — cannot resolve feature catalog." } };
  }
  const submitted = [...enabled, ...disabled];
  const notConfigurable = submitted.filter((feature) => !toggleableAtLocation.includes(feature as ProductFeature));
  if (notConfigurable.length > 0) {
    return { ok: false, status: 400, data: { error: `Module(s) not location-configurable: ${notConfigurable.join(", ")}` } };
  }
  const unsupported = enabled.filter((feature) => !siteEffectiveFeatures.includes(feature as ProductFeature));
  if (unsupported.length > 0) {
    return { ok: false, status: 400, data: { error: `Location features require parent site support: ${unsupported.join(", ")}` } };
  }
  if (locationId) {
    for (const feature of disabled) {
      const guard = await checkModuleHasLiveData(db, { organizationId, locationId }, feature as ProductFeature);
      if (guard.blocked) {
        return { ok: false, status: 409, data: { error: guard.reason ?? "Module has live content." } };
      }
    }
  }
  return { ok: true, normalized: JSON.stringify({ enabled, disabled }) };
}

export interface LocationCapabilitySummary {
  site_effective_features: ProductFeature[];
  location_effective_features: ProductFeature[];
  location_feature_overrides: CmsCapabilityOverrideDelta | null;
}

/** Everything the location settings page needs to diff a checkbox change against the correct
 *  baseline — the parent SITE's effective feature set, never the location's own current state
 *  (a location re-enabling something back to the site default must collapse to a null override,
 *  not an equivalent-but-redundant explicit delta). Shared by the location GET and PATCH routes
 *  so both return the same shape. */
export async function resolveLocationCapabilitySummary(
  db: D1Database,
  organizationId: string,
  locationFeatureOverridesRaw: string | null,
): Promise<LocationCapabilitySummary | null> {
  const site = await queryFirst<{ vertical: string; theme_id: string; feature_overrides: string | null }>(db, `
    SELECT vertical, theme_id, feature_overrides FROM organization WHERE id = ? LIMIT 1
  `, [organizationId]);
  if (!site) return null;
  const { parseCmsFeatureOverrideDelta } = await import("~/config/cms-registry");
  try {
    const { capabilities: siteCapabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
      siteEnabledFeatures: site.feature_overrides,
    });
    const siteEffectiveFeatures = [...new Set([...siteCapabilities.pages.map((p) => p.feature), ...siteCapabilities.managers.map((m) => m.id)])];

    const { capabilities: locationCapabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
      siteEnabledFeatures: site.feature_overrides,
      locationEnabledFeatures: locationFeatureOverridesRaw,
    });
    const locationEffectiveFeatures = [...new Set([...locationCapabilities.pages.map((p) => p.feature), ...locationCapabilities.managers.map((m) => m.id)])];

    return {
      site_effective_features: siteEffectiveFeatures,
      location_effective_features: locationEffectiveFeatures,
      location_feature_overrides: parseCmsFeatureOverrideDelta(locationFeatureOverridesRaw),
    };
  } catch (error) {
    // Fix the source of truth (mismatched vertical/theme, corrupt override JSON) rather than
    // reporting a fake "everything disabled" summary — that would look like real product state
    // instead of an unresolved config problem. Callers already handle a null summary safely
    // (spreading null into a response object is a no-op).
    console.error("resolveLocationCapabilitySummary: failed to resolve capabilities", { organizationId, error });
    return null;
  }
}

/**
 * One location, read the same way by every surface that asks for one.
 *
 * MCP used to keep its own copy of this (`getLocationForMcp`) with its own
 * address parse, which returned a shape its own tool schema rejected.
 */
export async function getLocation(
  db: D1Database,
  organizationId: string,
  locationIdOrSlug: string,
) {
  const row = await loadLocation(db, organizationId, locationIdOrSlug)
  if (!row) return null
  const { getMediaPlacements } = await import('~/server/utils/media-placement')
  const placements = await getMediaPlacements(db, { organizationId, ownerType: 'business_location', ownerIds: [row.id] })
  return {
    ...row,
    address: parsePostalAddress(row.address),
    opening_hours: parseOpeningHours(row.opening_hours ? JSON.parse(String(row.opening_hours)) : null),
    special_hours: parseSpecialHours(row.special_hours ? JSON.parse(String(row.special_hours)) : null),
    categories: row.categories ? JSON.parse(String(row.categories)) : null,
    media: (placements.get(row.id) ?? []).map(item => ({ asset_id: item.asset_id, slot: item.slot, public_url: item.public_url, thumbnail_url: item.thumbnail_url, kind: item.kind, sort_order: item.sort_order })),
  }
}

async function loadLocation(
  db: D1Database,
  organizationId: string,
  locationIdOrSlug: string,
) {
  const columns = `id, slug, title, phone, email, website_url, maps_url, google_review_url, google_place_id,
           rating, review_count, description, short_description, status,
           address, opening_hours, special_hours, categories, price_level,
           facebook_url, instagram_url, tiktok_url,
           timezone, max_capacity, seo_title, seo_description, canonical_url,
           feature_overrides, created_at, updated_at`;
  // Check id first so a slug that happens to collide with another row's id can
  // never shadow the row actually addressed by that id.
  const byId = await queryFirst<LocationRecord>(
    db,
    `SELECT ${columns} FROM business_locations WHERE id = ? AND organization_id = ?  LIMIT 1`,
    [locationIdOrSlug, organizationId],
  );
  if (byId) return byId;
  return queryFirst<LocationRecord>(
    db,
    `SELECT ${columns} FROM business_locations WHERE slug = ? AND organization_id = ?  LIMIT 1`,
    [locationIdOrSlug, organizationId],
  );
}

export async function createLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  input: CreateLocationInput,
  userId: string,
  options: { refreshSocialCardAfterCreate?: boolean } = {},
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

  // Same validation/semantics as updateLocation's feature_overrides handling: undefined/omitted
  // means "inherit the parent site's effective features" (stored as NULL); no locationId is
  // passed since a location being created has no existing content for the live-data guard to check.
  const featuresResult = await resolveValidatedLocationFeatures(db, organizationId, input.feature_overrides);
  if (!featuresResult.ok) {
    return { status: featuresResult.status, data: featuresResult.data };
  }
  const normalizedEnabledFeatures = featuresResult.normalized ?? null;

  const normalizedTimezone = input.timezone === undefined
    ? undefined
    : normalizeTimezone(input.timezone);

  if (normalizedTimezone !== undefined && normalizedTimezone !== null && !isValidTimezone(normalizedTimezone)) {
    return {
      status: 400,
      data: { error: "timezone must be a valid IANA time zone identifier." },
    };
  }

  let openingHours: string | null;
  let specialHours: string | null;
  try {
    openingHours = serializeOpeningHours(input.opening_hours);
    specialHours = serializeSpecialHours(input.special_hours);
  } catch (error) {
    return {
      status: 400,
      data: { error: error instanceof Error ? error.message : "Invalid opening hours." },
    };
  }

  const baseSlug = toSlug((input.slug ?? title).trim());
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let created: { id: string; location: Awaited<ReturnType<typeof loadLocation>> } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    try {
      const statements: { query: string; params: unknown[] }[] = [];
      statements.push({
        query: `
          INSERT INTO business_locations (
            id, organization_id, title, slug, phone, email, website_url, maps_url,
            google_review_url, google_place_id, description, short_description, address, opening_hours, special_hours, rating, review_count,
            price_level, facebook_url, instagram_url, tiktok_url,
            timezone, max_capacity, status,
            seo_title, seo_description, canonical_url, feature_overrides, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
        `,
        params: [
          id,
          organizationId,
          title,
          slug,
          input.phone ?? null,
          input.email ?? null,
          input.website_url ?? null,
          input.maps_url ?? null,
          input.google_review_url ?? null,
          input.google_place_id ?? null,
          input.description ?? null,
          input.short_description ?? null,
          input.address ? JSON.stringify(input.address) : null,
          openingHours,
          specialHours,
          input.rating ?? null,
          input.review_count ?? null,
          input.price_level ?? null,
          input.facebook_url ?? null,
          input.instagram_url ?? null,
          input.tiktok_url ?? null,
          normalizedTimezone ?? null,
          input.max_capacity ?? null,
          input.seo_title ?? null,
          input.seo_description ?? null,
          input.canonical_url ?? null,
          normalizedEnabledFeatures,
          now,
          now,
        ],
      });

      await executeBatch(db, statements);
      created = { id, location: await loadLocation(db, organizationId, id) };
      break;
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      if (error instanceof Error) {
        return { status: 400, data: { error: error.message } };
      }
      throw error;
    }
  }

  // Outside the retry, because the location is committed by the time these run
  // and neither is a slug conflict. Inside it, a failed audit write was returned
  // to the caller as a 400 — a client error for a server failure, on a location
  // that exists — and, worse, activity_entries.dedupe_key is unique, so a
  // duplicate audit key matched isUniqueConstraintError and sent the loop round
  // again to create a second location.
  if (created) {
    await fireOrganizationEvent({
      db,
      organizationId,
      locationId: created.id,
      actorId: userId,
      eventType: "location.created",
      entityType: "business_location",
      entityId: created.id,
      metadata: {
        title,
      },
    })
    if (options.refreshSocialCardAfterCreate !== false) {
      await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: created.id }, actorId: userId })
    }
    return { status: 201, data: { success: true, location: created.location } };
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
  locationIdOrSlug: string,
  input: UpdateLocationInput,
  userId: string,
  env?: CloudflareEnv,
) {
  const existing = await loadLocation(db, organizationId, locationIdOrSlug);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }
  const locationId = existing.id;

  if (Object.keys(input).length === 0) {
    return { status: 400, data: { error: "No update fields provided." } };
  }

  if (input.title !== undefined && !input.title.trim()) {
    return { status: 400, data: { error: "title cannot be empty." } };
  }

  const updateFeaturesResult = await resolveValidatedLocationFeatures(db, organizationId, input.feature_overrides, locationId);
  if (!updateFeaturesResult.ok) {
    return { status: updateFeaturesResult.status, data: updateFeaturesResult.data };
  }
  const normalizedEnabledFeatures = updateFeaturesResult.normalized;
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
    "timezone",
    "max_capacity",
    "status",
    "seo_title",
    "seo_description",
    "canonical_url",
  ] as const;

  for (const field of simpleFields) {
    if (input[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(
        field === "timezone"
          ? normalizedTimezone ?? null
          : input[field] ?? null,
      );
    }
  }

  if (input.address !== undefined) {
    sets.push("address = ?");
    params.push(input.address ? JSON.stringify(input.address) : null);
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
  if (input.feature_overrides !== undefined) {
    sets.push("feature_overrides = ?");
    params.push(normalizedEnabledFeatures ?? null);
  }

  const runUpdate = async (boundParams: Array<string | number | null>) => {
    const statements: { query: string; params: unknown[] }[] = [];
    statements.push({
      query: `
        UPDATE business_locations
        SET ${sets.join(", ")}
        WHERE id = ? AND organization_id = ?
      `,
      params: boundParams,
    });

    await executeBatch(db, statements);
  };

  if (slugBase && slugParamIndex !== null) {
    let updated: { location: Awaited<ReturnType<typeof loadLocation>> } | null = null;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = attempt === 0 ? slugBase : `${slugBase}-${attempt + 1}`;
      const boundParams = [...params];
      boundParams[slugParamIndex] = slug;
      boundParams.push(locationId, organizationId);
      try {
        await runUpdate(boundParams);
        const location = await loadLocation(
          db,
          organizationId,
          locationId,
        );
        updated = { location };
        break;
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        if (error instanceof Error) {
          return { status: 400, data: { error: error.message } };
        }
        throw error;
      }
    }

    // Outside the retry, for the same reason as createLocation: the row is
    // already written, neither of these is a slug conflict, and the unique
    // dedupe_key on an audit row matched isUniqueConstraintError and sent the
    // loop round again.
    if (updated) {
      await fireOrganizationEvent({
        db,
        organizationId,
        locationId,
        actorId: userId,
        eventType: "location.updated",
        entityType: "business_location",
        entityId: locationId,
        metadata: {
          title: updated.location?.title ?? null,
        },
      })
      if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: locationId }, actorId: userId })
      return { status: 200, data: { success: true, location: updated.location } };
    }

    return {
      status: 409,
      data: {
        error: `Unable to allocate a unique location slug after ${MAX_SLUG_ATTEMPTS} attempts.`,
      },
    };
  }

  params.push(locationId, organizationId);
  await runUpdate(params);
  const location = await loadLocation(db, organizationId, locationId);
  await fireOrganizationEvent({
    db,
    organizationId,
    
    locationId,
    actorId: userId,
    eventType: "location.updated",
    entityType: "business_location",
    entityId: locationId,
    metadata: {
      title: location?.title ?? null,
    },
  })
  if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: locationId }, actorId: userId })
  return { status: 200, data: { success: true, location } };
}

export async function deleteLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  locationIdOrSlug: string,
) {
  const existing = await loadLocation(db, organizationId, locationIdOrSlug);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }
  const locationId = existing.id;
  const now = new Date().toISOString();
  const statements = [
    ...prepareContentDocumentDeletion({ locationId, organizationId}),
    ...resourceLocalizationDeletionQueries('business_location', { query: 'SELECT id FROM business_locations WHERE id = ? AND organization_id = ?', params: [locationId, organizationId] }),
    // Deleting a location does NOT delete the products it offered: the
    // catalog belongs to the organization and other locations may still sell
    // them. The membership row goes (cascaded by the foreign key) and the
    // product stays. Only the location's own media and redirects are removed.
    { query: `DELETE FROM organization_redirects WHERE organization_id = ? AND (
        (owner_type = 'business_location' AND owner_id = ?) OR
        (owner_type = 'review' AND owner_id IN (SELECT id FROM reviews WHERE location_id = ?))
      )`, params: [organizationId, locationId, locationId] },
    { query: `DELETE FROM media_placements WHERE organization_id = ? AND
        owner_type = 'review' AND owner_id IN (SELECT id FROM reviews WHERE location_id = ?)
      `, params: [organizationId, locationId] },
    { query: 'DELETE FROM reviews WHERE location_id = ? AND organization_id = ?', params: [locationId, organizationId] },
    {
      query: `
      DELETE FROM media_placements
      WHERE organization_id = ? AND owner_type = 'business_location' AND owner_id = ?
    `,
      params: [organizationId, locationId],
    },
    {
      query: `
      UPDATE user_workspace_state
      SET location_id = NULL,
          updated_at = ?
      WHERE organization_id = ? AND location_id = ?
    `,
      params: [now, organizationId, locationId],
    },
    {
      query: `
      DELETE FROM requests WHERE organization_id = ? AND location_id = ? AND kind IN ('reservation', 'booking')
    `,
      params: [organizationId, locationId],
    },
    {
      query: `
      DELETE FROM business_locations
      WHERE id = ? AND organization_id = ?
    `,
      params: [locationId, organizationId],
    },
  ];

  const batchResults = await executeBatch(db, statements);
  const deleteResult = batchResults.at(-1);

  if (!deleteResult?.meta.changes) {
    return { status: 404, data: { error: "Location not found." } };
  }

  return {
    status: 200,
    data: { success: true, location_id: locationId, deleted: true },
  };
}
