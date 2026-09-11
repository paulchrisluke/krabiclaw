import { parseOpeningHours, parseSpecialHours, type OpeningHours, type SpecialHours } from '~/shared/reservation-hours'
import { fireOrganizationEventSafe } from "~/server/utils/organization-events";
import { executeBatch, queryFirst } from "~/server/db";
import { isValidTimezone, normalizeTimezone } from "~/utils/timezone";
import { parsePhone } from "~/utils/phone";
import type { CmsCapabilityOverrideDelta, ProductFeature } from "~/config/cms-registry";
import { resolveSiteCmsCapabilities } from "~/server/utils/cms-capabilities";
import { checkModuleHasLiveData } from "~/server/utils/module-content-guard";
import { ensureLocationTeam } from "~/server/utils/member-access";
import type { CloudflareEnv } from "~/server/utils/auth";
import { refreshSocialCard } from '~/server/utils/social-card'
import { resourceLocalizationDeletionQueries } from '~/server/utils/localization'
import { prepareContentDocumentDeletion } from '~/server/utils/content/documents'
import { parseRobotsIntent, ROBOTS_INTENTS } from '~/shared/robots-directive'

/** A location stores an indexing intent, never a rendered directive. */
function normalizeLocationRobots(value: unknown) {
  const parsed = parseRobotsIntent(value)
  if (!parsed.ok) throw new Error(`robots must be one of: ${ROBOTS_INTENTS.join(', ')}`)
  return parsed.intent
}

export function normalizeLocationNotificationPhone(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || !raw.trim()) return null;
  const parsed = parsePhone(raw, { defaultCountry: "TH" });
  if (!parsed.valid || !parsed.e164) {
    throw new Error("notification_phone must be a valid phone number, including country code.");
  }
  return parsed.e164;
}

type SetupEnv = CloudflareEnv;

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
  google_review_url?: string | null;
  google_place_id?: string | null;
  description?: string | null;
  short_description?: string | null;
  address?: string | Record<string, unknown> | null;
  opening_hours?: OpeningHours;
  special_hours?: SpecialHours;
  price_level?: string | null;
  rating?: number | null;
  review_count?: number | null;
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
  address?: string | null;
  opening_hours?: string | null;
  special_hours?: string | null;
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
  siteId: string,
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
    SELECT vertical, theme_id, feature_overrides FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [siteId, organizationId]);
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
      const guard = await checkModuleHasLiveData(db, { siteId, locationId }, feature as ProductFeature);
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
  siteId: string,
  locationFeatureOverridesRaw: string | null,
): Promise<LocationCapabilitySummary | null> {
  const site = await queryFirst<{ vertical: string; theme_id: string; feature_overrides: string | null }>(db, `
    SELECT vertical, theme_id, feature_overrides FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [siteId, organizationId]);
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
    console.error("resolveLocationCapabilitySummary: failed to resolve capabilities", { siteId, error });
    return null;
  }
}

async function loadLocation(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const columns = `id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_review_url, google_place_id,
           rating, review_count, description, short_description, status,
           address, opening_hours, special_hours, price_level,
           facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
           notification_phone, timezone, max_capacity, seo_title, seo_description, canonical_url, robots,
           feature_overrides, created_at, updated_at`;
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
  const featuresResult = await resolveValidatedLocationFeatures(db, organizationId, siteId, input.feature_overrides);
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

  let normalizedNotificationPhone: string | null;
  let openingHours: string | null;
  let specialHours: string | null;
  try {
    openingHours = serializeOpeningHours(input.opening_hours);
    specialHours = serializeSpecialHours(input.special_hours);
    normalizedNotificationPhone = normalizeLocationNotificationPhone(input.notification_phone);
  } catch (error) {
    return {
      status: 400,
      data: { error: error instanceof Error ? error.message : "Invalid notification_phone." },
    };
  }

  const baseSlug = toSlug((input.slug ?? title).trim());
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;

    try {
      const statements: { query: string; params: unknown[] }[] = [];
      statements.push({
        query: `
          INSERT INTO business_locations (
            id, organization_id, site_id, title, slug, city, neighborhood, phone, email, website_url, maps_url,
            google_review_url, google_place_id, description, short_description, address, opening_hours, special_hours, rating, review_count,
            price_level, facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
            notification_phone, timezone, max_capacity, status,
            seo_title, seo_description, canonical_url, robots, feature_overrides, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
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
          openingHours,
          specialHours,
          input.rating ?? null,
          input.review_count ?? null,
          input.price_level ?? null,
          input.facebook_url ?? null,
          input.instagram_url ?? null,
          input.tiktok_url ?? null,
          normalizeOrderingUrl(input.grab_url, "grab_url"),
          normalizeOrderingUrl(input.uber_eats_url, "uber_eats_url"),
          normalizeOrderingUrl(input.foodpanda_url, "foodpanda_url"),
          normalizedNotificationPhone,
          normalizedTimezone ?? null,
          input.max_capacity ?? null,
          input.seo_title ?? null,
          input.seo_description ?? null,
          input.canonical_url ?? null,
          normalizeLocationRobots(input.robots),
          normalizedEnabledFeatures,
          now,
          now,
        ],
      });

      await executeBatch(db, statements);
      try {
        await ensureLocationTeam(db, {
          env,
          organizationId,
          siteId,
          locationId: id,
          name: title,
        });
      } catch (teamError) {
        const compensating = [{
          query: `DELETE FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?`,
          params: [id, organizationId, siteId],
        }];
        await executeBatch(db, compensating).catch((cleanupError) => {
          console.error("Failed to roll back orphaned location after team provisioning failure:", cleanupError);
        });
        throw teamError;
      }
      const location = await loadLocation(db, organizationId, siteId, id);
      await fireOrganizationEventSafe({
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
        },
      })
      if (options.refreshSocialCardAfterCreate !== false) {
        await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: id }, actorId: userId })
      }
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
  env?: CloudflareEnv,
) {
  const existing = await loadLocation(db, organizationId, siteId, locationIdOrSlug);
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
  const updateFeaturesResult = await resolveValidatedLocationFeatures(db, organizationId, siteId, input.feature_overrides, locationId);
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
    "notification_phone",
    "timezone",
    "max_capacity",
    "status",
    "seo_title",
    "seo_description",
    "canonical_url",
    "robots",
  ] as const;

  for (const field of simpleFields) {
    if (input[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(
        field === "timezone"
          ? normalizedTimezone ?? null
          : field === "notification_phone"
            ? normalizedNotificationPhone ?? null
            : field === "robots"
              ? normalizeLocationRobots(input.robots)
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
        await fireOrganizationEventSafe({
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
        if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: locationId }, actorId: userId })
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
  await fireOrganizationEventSafe({
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
  if (env) await refreshSocialCard({ db, env, owner: { owner_type: 'business_location', owner_id: locationId }, actorId: userId })
  return { status: 200, data: { success: true, location } };
}

export async function deleteLocation(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationIdOrSlug: string,
) {
  const existing = await loadLocation(db, organizationId, siteId, locationIdOrSlug);
  if (!existing) {
    return { status: 404, data: { error: "Location not found." } };
  }
  const locationId = existing.id;
  const now = new Date().toISOString();
  const statements = [
    ...prepareContentDocumentDeletion({ locationId, organizationId, siteId }),
    ...resourceLocalizationDeletionQueries('business_location', { query: 'SELECT id FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ?', params: [locationId, organizationId, siteId] }),
    ...([
      ['product', 'products'], ['product_category', 'product_categories'],
    ] as const).flatMap(([type, table]) => resourceLocalizationDeletionQueries(type, {
      query: `SELECT id FROM ${table} WHERE location_id = ? AND organization_id = ? AND site_id = ?`, params: [locationId, organizationId, siteId],
    })),
    { query: `DELETE FROM site_redirects WHERE organization_id = ? AND site_id = ? AND (
        (owner_type = 'business_location' AND owner_id = ?) OR
        (owner_type = 'product' AND owner_id IN (SELECT id FROM products WHERE location_id = ?)) OR
        (owner_type = 'product_category' AND owner_id IN (SELECT id FROM product_categories WHERE location_id = ?)) OR
        (owner_type = 'review' AND owner_id IN (SELECT id FROM reviews WHERE location_id = ?))
      )`, params: [organizationId, siteId, locationId, locationId, locationId, locationId] },
    { query: `DELETE FROM media_placements WHERE organization_id = ? AND site_id = ? AND (
        (owner_type = 'product' AND owner_id IN (SELECT id FROM products WHERE location_id = ?)) OR
        (owner_type = 'review' AND owner_id IN (SELECT id FROM reviews WHERE location_id = ?))
      )`, params: [organizationId, siteId, locationId, locationId] },
    { query: 'DELETE FROM reviews WHERE location_id = ? AND organization_id = ? AND site_id = ?', params: [locationId, organizationId, siteId] },
    {
      query: `
      DELETE FROM media_placements
      WHERE organization_id = ? AND site_id = ? AND owner_type = 'business_location' AND owner_id = ?
    `,
      params: [organizationId, siteId, locationId],
    },
    {
      query: `
      UPDATE user_workspace_state
      SET location_id = NULL,
          updated_at = ?
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
    `,
      params: [now, organizationId, siteId, locationId],
    },
    {
      query: `
      DELETE FROM requests WHERE organization_id = ? AND site_id = ? AND location_id = ? AND kind IN ('reservation', 'booking')
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
  const deleteResult = batchResults.at(-1);

  if (!deleteResult?.meta.changes) {
    return { status: 404, data: { error: "Location not found." } };
  }

  return {
    status: 200,
    data: { success: true, location_id: locationId, deleted: true },
  };
}
