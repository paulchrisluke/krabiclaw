import { createError, type H3Event } from "h3";
import { hasEntitlement } from "~/server/utils/billing";
import {
  requestImageUpload,
  buildImageUrl,
  uploadImageBuffer,
} from "~/server/utils/cloudflare-images";
import {
  createMediaAsset,
  activateMediaAsset,
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  updateMediaAssetMetadata,
} from "~/server/utils/media-asset-manager";
import {
  createLocation,
  deleteLocation,
  updateLocation,
} from "~/server/utils/location-management";
import {
  createMenu,
  createMenuItem,
  deleteMenu,
  deleteMenuItem,
  deleteMenuSection,
  getMenuWithItems,
  getMenus,
  renameMenuSection,
  reorderMenuItems,
  updateMenu,
  updateMenuItem,
} from "~/server/utils/menu-management";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from "~/server/utils/post-management";
import {
  createExperience,
  deleteExperience,
  getExperienceById,
  listExperienceBookings,
  listExperiences,
  updateBookingStatus,
  updateExperience,
} from "~/server/utils/experiences";
import {
  buildTranslationInventory,
  createTranslationJob,
  publishTranslationDrafts,
} from "~/server/utils/translation-inventory";
import {
  listTranslationReviewItems,
  saveTranslationReviewItem,
} from "~/server/utils/translation-review";
import { processTranslationJobBatch } from "~/server/utils/translation-processor";
import { parseScope } from "~/server/utils/translation-helpers";
import {
  createLocationQa,
  deleteLocationQa,
  listLocationQa,
} from "~/server/utils/location-qa";
import {
  listSiteLocales,
  upsertSiteLocale,
  deleteSiteLocale,
} from "~/server/utils/site-locales";
import { replyToReview } from "~/server/utils/review-management";
import { createWorkRequest } from "~/server/utils/work-request-management";
import { runSiteCreation } from "~/server/utils/site-creation";
import { updateSiteSettingsFields } from "~/server/utils/site-settings";
import { getMcpTool } from "~/server/utils/mcp-tools";
import { requireMcpSite, requireMcpUser } from "~/server/utils/mcp-auth";
import { mcpProtocolError, MCP_ERROR } from "~/server/utils/mcp-protocol";
import { renderWidget } from "~/server/utils/mcp-render";
import { getPlaceDetails, searchPlaces } from "~/server/utils/google-places";
import type { SiteVertical } from "~/utils/vertical-copy";
import {
  deleteContentField,
  discardContentDrafts,
  getContentDraftStatus,
  getGoogleBusinessLocationAuthUrlForMcp,
  getGoogleBusinessLocationConnectionForMcp,
  getMergedEditorContent,
  getLocationForMcp,
  getNotificationsSettings,
  getSiteForMcp,
  listContactSubmissions,
  listGoogleBusinessAccountsForMcp,
  listLocationReviews,
  listReservationSubmissions,
  listSitesForUser,
  listWorkRequestsForOrganization,
  publishContentDrafts,
  reorderLocationQa,
  saveContentDraft,
  syncGoogleBusinessLocationsForMcp,
  updateContactSubmissionStatus,
  updateLocationQa,
  updateNotificationsSettings,
  updateReservationSubmissionStatus,
} from "~/server/utils/mcp-workflows";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GoogleMapsSignals {
  nameHint: string | null;
  lat: number | null;
  lng: number | null;
  rawId: string | null;
  isHexCid: boolean;
  isChijId: boolean;
  hasStrongSignals: boolean;
}

function extractGoogleMapsSignals(resolvedUrl: string): GoogleMapsSignals {
  const rawIdMatch = resolvedUrl.match(/!1s([^!&]+)/);
  const rawId = rawIdMatch ? decodeURIComponent(rawIdMatch[1]!) : null;
  const isHexCid = rawId ? /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(rawId) : false;
  const isChijId = rawId ? /^ChIJ/.test(rawId) : false;

  const nameFromPath = resolvedUrl.match(/\/maps\/place\/([^/@?]+)/)?.[1];
  const nameHint = nameFromPath
    ? decodeURIComponent(nameFromPath.replace(/\+/g, " "))
    : null;

  // !3d/!4d are the exact business coords; @ is the map viewport (less precise)
  const lat3d = resolvedUrl.match(/!3d(-?[\d.]+)/)?.[1];
  const lng4d = resolvedUrl.match(/!4d(-?[\d.]+)/)?.[1];
  const viewportMatch = resolvedUrl.match(/@(-?[\d.]+),(-?[\d.]+)/);
  const latRaw = lat3d ?? viewportMatch?.[1] ?? null;
  const lngRaw = lng4d ?? viewportMatch?.[2] ?? null;
  const lat = latRaw != null ? Number(latRaw) : null;
  const lng = lngRaw != null ? Number(lngRaw) : null;

  const hasStrongSignals = (lat != null && lng != null) && (isChijId || isHexCid);

  return { nameHint, lat, lng, rawId, isHexCid, isChijId, hasStrongSignals };
}

interface ParsedHint {
  name_hint?: string;
  lat?: number;
  lng?: number;
  feature_id?: string;
  internal_id?: string;
  expected_country?: string;
  expected_region?: string;
}

interface MatchingPolicy {
  allow_name_only_fallback: boolean;
  require_coordinate_match: boolean;
  max_distance_km: number;
  prefer_backend_extraction: boolean;
}

const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  allow_name_only_fallback: false,
  require_coordinate_match: true,
  max_distance_km: 5,
  prefer_backend_extraction: true,
};

function resolveMatchingPolicy(raw: unknown): MatchingPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_MATCHING_POLICY;
  const p = raw as Partial<MatchingPolicy>;
  return {
    allow_name_only_fallback: p.allow_name_only_fallback ?? DEFAULT_MATCHING_POLICY.allow_name_only_fallback,
    require_coordinate_match: p.require_coordinate_match ?? DEFAULT_MATCHING_POLICY.require_coordinate_match,
    max_distance_km: typeof p.max_distance_km === "number" ? p.max_distance_km : DEFAULT_MATCHING_POLICY.max_distance_km,
    prefer_backend_extraction: p.prefer_backend_extraction ?? DEFAULT_MATCHING_POLICY.prefer_backend_extraction,
  };
}

export async function executeMcpToolCall(
  event: H3Event,
  toolName: string,
  rawArguments: Record<string, unknown>,
) {
  const tool = getMcpTool(toolName);
  if (!tool) {
    throw mcpProtocolError(
      MCP_ERROR.methodNotFound,
      `Unknown tool: ${toolName}`,
    );
  }

  validateRequiredArguments(tool.inputSchema, rawArguments);

  if (toolName === "show_welcome" || toolName === "list_sites") {
    const user = await requireMcpUser(event);
    const allSites = await listSitesForUser(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    const sites = allSites.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.brand_name ?? s.slug,
      subdomain: s.subdomain,
      publicUrl: s.subdomain ? `https://${s.subdomain}.krabiclaw.com` : null,
      status: s.status ?? "draft",
    }));
    return renderWidget(
      "welcome-list",
      { sites },
      sites.length === 0
        ? "Welcome to KrabiClaw. You have no sites yet — let's create one."
        : `You have ${sites.length} site${sites.length > 1 ? "s" : ""}: ${sites.map((s: { name: unknown }) => s.name).join(", ")}.`,
    );
  }

  if (toolName === "show_vertical_picker") {
    await requireMcpUser(event);
    return renderWidget(
      "vertical-picker",
      {},
      "What type of business is this? Choose: restaurant or experience.",
    );
  }  

  if (toolName === "import_from_maps") {
    const user = await requireMcpUser(event);
    const apiKey = (user.env as Record<string, unknown>)
      .GOOGLE_PLACES_API_KEY as string | undefined;
    if (!apiKey)
      throw mcpProtocolError(
        MCP_ERROR.internal,
        "Google Places API not configured.",
      );

    const rawUrl = requiredString(rawArguments, "maps_url");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid Maps URL.");
    }

    if (!isAllowedGoogleMapsHost(parsedUrl.hostname)) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "URL does not appear to be a Google Maps link. Please paste a google.com/maps or maps.app.goo.gl link.",
      );
    }

    const hint = (rawArguments.parsed_hint ?? null) as ParsedHint | null;
    const policy = resolveMatchingPolicy(rawArguments.matching_policy);

    // Resolve short URLs (maps.app.goo.gl).
    // Use redirect:follow GET instead of redirect:manual HEAD —
    // Cloudflare Workers blocks manual redirect fetches against goo.gl.
    let resolvedUrl = parsedUrl.toString();
    if (parsedUrl.hostname === "maps.app.goo.gl") {
      try {
        const probe = await fetch(parsedUrl.toString(), {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (probe.url && isAllowedGoogleMapsHost(new URL(probe.url).hostname)) {
          resolvedUrl = probe.url;
        }
      } catch {
        /* keep original — will fall through to text search below */
      }
    }

    // Backend is parser of record. Extract signals deterministically from the resolved URL.
    const backendParsed = extractGoogleMapsSignals(resolvedUrl);

    // If a hint was provided, warn when it diverges from backend extraction (>1 km).
    // Hint is informational only — backend extraction takes precedence.
    if (hint?.lat != null && hint?.lng != null && backendParsed.lat != null && backendParsed.lng != null) {
      const divergenceKm = haversineKm(hint.lat, hint.lng, backendParsed.lat, backendParsed.lng);
      if (divergenceKm > 1) {
        console.warn("[import_from_maps] parsed_hint diverges from backend extraction", {
          hint: { lat: hint.lat, lng: hint.lng },
          backendParsed: { lat: backendParsed.lat, lng: backendParsed.lng },
          divergenceKm: Math.round(divergenceKm * 10) / 10,
        });
      }
    }

    // Use backend extraction as authoritative. Fall back to hint only for fields the
    // backend could not extract (e.g. a short link that failed to resolve).
    const nameHint = backendParsed.nameHint ?? hint?.name_hint ?? null;
    const lat = backendParsed.lat ?? (hint?.lat != null ? hint.lat : null);
    const lng = backendParsed.lng ?? (hint?.lng != null ? hint.lng : null);
    const { rawId, isHexCid, isChijId } = backendParsed;

    let placeId: string | null = null;

    if (isChijId) {
      // Best case — proper ChIJ ID directly from URL
      placeId = rawId;
    } else if (isHexCid || !rawId) {
      // Hex CID or no ID — resolve via coordinate-biased text search
      if (!nameHint) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Could not extract place details from that Maps URL. Try copying the full Google Maps URL from the address bar.",
        );
      }
      if (!policy.allow_name_only_fallback && lat == null) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "This URL does not contain location coordinates. Paste the full Google Maps URL from the address bar so the place can be identified precisely.",
        );
      }
      const locationBias =
        lat != null && lng != null
          ? { latitude: lat, longitude: lng }
          : undefined;
      const results = await searchPlaces(apiKey, nameHint, locationBias);
      const candidate = results[0];
      if (!candidate?.placeId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Could not find "${nameHint}" in Google Places. Try the full Maps URL from the address bar.`,
        );
      }
      if (
        policy.require_coordinate_match &&
        locationBias &&
        candidate.lat != null &&
        candidate.lng != null
      ) {
        const distKm = haversineKm(
          locationBias.latitude,
          locationBias.longitude,
          candidate.lat,
          candidate.lng,
        );
        if (distKm > policy.max_distance_km) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            `The top search result for "${nameHint}" is ${Math.round(distKm)} km from the location in that URL. Paste the full Google Maps URL from the address bar so the exact place can be identified.`,
          );
        }
      }
      placeId = candidate.placeId;
    } else {
      // Non-ChIJ, non-hex — try it directly; Places API will 404 if invalid
      placeId = rawId;
    }

    if (!placeId) throw mcpProtocolError(MCP_ERROR.invalidParams, "Could not resolve a place ID from that URL.")
    const details = await getPlaceDetails(apiKey, placeId, true);

    // Upload Google Photos to Cloudflare Images for stable preview URLs.
    // We don't have an org/site yet, so we do NOT persist media_asset rows here.
    // The returned cfImageId lets the model create proper media_assets after create_site.
    const photos: Array<{ cfImageId: string; publicUrl: string }> = [];
    const hasImagesConfig =
      (user.env as Record<string, unknown>).CLOUDFLARE_IMAGES_API_TOKEN &&
      (user.env as Record<string, unknown>).CF_ACCOUNT_ID;

    if (hasImagesConfig && details.photos.length > 0) {
      for (const photo of details.photos.slice(0, 10)) {
        try {
          const imgRes = await fetch(photo.photoUri, {
            signal: AbortSignal.timeout(15000),
          });
          if (!imgRes.ok) continue;
          const contentLength = Number(imgRes.headers.get("content-length"));
          if (contentLength > 10 * 1024 * 1024) continue;
          const buffer = await imgRes.arrayBuffer();
          if (buffer.byteLength > 10 * 1024 * 1024) continue;
          const contentType =
            imgRes.headers.get("content-type") ?? "image/jpeg";
          const uploaded = await uploadImageBuffer(
            user.env as Parameters<typeof uploadImageBuffer>[0],
            buffer,
            `maps-photo-${placeId}-${photos.length}.jpg`,
            contentType,
          );
          photos.push({
            cfImageId: uploaded.imageId,
            publicUrl: uploaded.publicUrl,
          });
        } catch {
          /* skip failed photos */
        }
      }
    }

    const structuredContent = {
      business: {
        name: details.name,
        address: details.formattedAddress,
        phone: details.phone,
        hours: details.openingHours ?? [],
        rating: details.rating,
        reviewCount: details.ratingCount,
        placeId: details.placeId,
        mapsUrl: details.mapsUrl ?? rawUrl,
      },
      photos,
      missingPhotos: photos.length < 3,
    };

    return renderWidget(
      "photo-album",
      structuredContent,
      `Imported: ${details.name} — ${details.formattedAddress}. ${photos.length} photo${photos.length !== 1 ? "s" : ""} found.`,
    );
  }

  if (toolName === "show_generated_images") {
    await requireMcpUser(event);
    const raw = objectArray(rawArguments.images, "images");
    if (raw.length === 0) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "images must be non-empty. Call save_generated_image first to get an assetId and publicUrl, then pass the result here.",
      );
    }
    for (const img of raw) {
      if (
        typeof img.assetId !== "string" ||
        !img.assetId ||
        typeof img.publicUrl !== "string" ||
        !img.publicUrl
      ) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Each image must have a non-empty assetId and publicUrl. Call save_generated_image first.",
        );
      }
    }
    const images = raw.map((img) => ({
      assetId: img.assetId as string,
      publicUrl: img.publicUrl as string,
    }));
    return renderWidget(
      "image-carousel",
      { images },
      `${images.length} AI-generated image${images.length !== 1 ? "s" : ""} ready to review.`,
    );
  }

  if (toolName === "create_site") {
    const user = await requireMcpUser(event);
    const result = await runSiteCreation(user.env, user.db, user.userId, {
      name: requiredString(rawArguments, "name"),
      subdomain: requiredString(rawArguments, "subdomain"),
      vertical: requiredString(rawArguments, "vertical") as SiteVertical,
    });
    assertDomainSuccess(result);
    return normalizeSiteCreationData(result.data);
  }

  const siteId = requiredString(rawArguments, "site_id");
  const site = await requireMcpSite(event, siteId, tool.minimumRole);
  const args = omit(rawArguments, ["site_id"]);

  if (
    tool.requiredEntitlement &&
    !(await hasEntitlement(
      site.env,
      site.db,
      site.organizationId,
      tool.requiredEntitlement,
    ))
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: `${humanizeEntitlement(tool.requiredEntitlement)} is not enabled for this organization.`,
    });
  }

  switch (toolName) {
    case "show_site_preview": {
      const siteRow = await getSiteForMcp(site.db, site.siteId, site.userId);
      const subdomain = (siteRow as Record<string, unknown>)
        .subdomain as string;
      const publicUrl = subdomain ? `https://${subdomain}.krabiclaw.com` : "";
      const locationRows = await site.db
        .prepare(
          `SELECT bl.slug, bl.title, ma.public_url AS hero_image_public_url
         FROM business_locations bl
         LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
         WHERE bl.site_id = ?
         ORDER BY bl.is_primary DESC, bl.title ASC
         LIMIT 5`,
        )
        .bind(site.siteId)
        .all<{
          slug: string;
          title: string;
          hero_image_public_url: string | null;
        }>();
      const locationPages = (locationRows.results ?? []).map((loc) => ({
        label: loc.title,
        path: `/${loc.slug}`,
      }));
      const pages = [{ label: "Home", path: "/" }, ...locationPages];
      const ogImageUrl =
        locationRows.results?.[0]?.hero_image_public_url ?? null;
      return renderWidget(
        "site-preview",
        {
          site: {
            id: site.siteId,
            name: (siteRow as Record<string, unknown>).brand_name ?? subdomain,
            subdomain,
            publicUrl,
          },
          pages,
          ogImageUrl,
        },
        `Your site is live at ${publicUrl}`,
      );
    }
    case "get_site":
      return { site: await getSiteForMcp(site.db, site.siteId, site.userId) };
    case "get_site_settings":
      return {
        settings: await loadSiteSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_site_settings": {
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        args as Record<string, unknown>,
        site.userId,
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "list_locations": {
      const rows = await site.db
        .prepare(
          `
        SELECT id, slug, title, city, neighborhood, phone, email, website_url, maps_url, google_place_id,
               rating, review_count, description, short_description, status, is_primary,
               address, opening_hours, hero_image_asset_id, hero_video_asset_id, price_level,
               facebook_url, instagram_url, tiktok_url, grab_url, uber_eats_url, foodpanda_url,
               created_at, updated_at
        FROM business_locations
        WHERE organization_id = ? AND site_id = ?
        ORDER BY is_primary DESC, title ASC
      `,
        )
        .bind(site.organizationId, site.siteId)
        .all();
      return { locations: rows.results ?? [] };
    }
    case "get_location":
      return {
        location: await getLocationForMcp(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "create_location": {
      const result = await createLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        args as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "update_location": {
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        omit(args, ["location_id"]) as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "delete_location": {
      const result = await deleteLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        site.userId,
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "list_menus":
      return {
        menus: await getMenus(
          site.db,
          site.organizationId,
          site.siteId,
          optionalString(args, "location_id") ?? undefined,
        ),
      };
    case "get_menu":
      return {
        menu: await getMenuWithItems(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
        ),
      };
    case "create_menu":
      return {
        menu: await createMenu(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
        ),
      };
    case "update_menu":
      return {
        menu: await updateMenu(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
          omit(args, ["menu_id"]) as never,
          site.userId,
        ),
      };
    case "delete_menu":
      return {
        deleted: await deleteMenu(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
        ),
      };
    case "create_menu_item":
      return {
        item: await createMenuItem(
          site.db,
          requiredString(args, "menu_id"),
          omit(args, ["menu_id"]) as never,
          site.userId,
        ),
      };
    case "update_menu_item":
      return {
        item: await updateMenuItem(
          site.db,
          requiredString(args, "menu_item_id"),
          omit(args, ["menu_item_id"]) as never,
          site.userId,
        ),
      };
    case "delete_menu_item":
      return {
        deleted: await deleteMenuItem(
          site.db,
          requiredString(args, "menu_item_id"),
        ),
      };
    case "rename_menu_section":
      return {
        updated: await renameMenuSection(
          site.db,
          requiredString(args, "menu_id"),
          requiredString(args, "old_name"),
          requiredString(args, "new_name"),
          site.userId,
        ),
      };
    case "delete_menu_section":
      return {
        deleted: await deleteMenuSection(
          site.db,
          requiredString(args, "menu_id"),
          requiredString(args, "section_name"),
        ),
      };
    case "reorder_menu_items":
      await reorderMenuItems(
        site.db,
        requiredString(args, "menu_id"),
        objectArray(args.updates, "updates").map((item) => {
          const sortOrder = item.sort_order;
          if (
            typeof sortOrder !== "number" ||
            !Number.isFinite(sortOrder) ||
            !Number.isInteger(sortOrder)
          ) {
            throw mcpProtocolError(
              MCP_ERROR.invalidParams,
              "Each update must have an integer sort_order",
            );
          }
          return { id: requiredString(item, "id"), sort_order: sortOrder };
        }),
      );
      return { updated: true };
    case "list_posts":
      return {
        posts: await listPosts(
          site.db,
          site.organizationId,
          site.siteId,
          optionalString(args, "status") ?? undefined,
        ),
      };
    case "get_post":
      return {
        post: await getPost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
        ),
      };
    case "create_post":
      return {
        post: await createPost(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
        ),
      };
    case "update_post":
      return {
        post: await updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          omit(args, ["post_id"]) as never,
          site.userId,
        ),
      };
    case "publish_post":
      return {
        post: await publishPost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          normalizeChannels(args.channels),
        ),
      };
    case "delete_post":
      return {
        deleted: await deletePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
        ),
      };
    case "list_media_assets":
      return {
        assets: await listMediaAssets(site.db, site.siteId, {
          kind: optionalString(args, "kind") ?? undefined,
          locationId: optionalString(args, "location_id") ?? undefined,
        }),
      };
    case "request_media_upload": {
      if (!site.env.CLOUDFLARE_IMAGES_API_TOKEN || !site.env.CF_ACCOUNT_ID)
        throw new Error("Cloudflare Images not configured");
      const assetId = crypto.randomUUID();
      const upload = await requestImageUpload(site.env);
      await createMediaAsset(site.db, {
        id: assetId,
        organization_id: site.organizationId,
        site_id: site.siteId,
        location_id: optionalString(args, "location_id") ?? null,
        kind: "image",
        provider: "cloudflare_images",
        source: "uploaded",
        cloudflare_image_id: upload.imageId,
        status: "pending",
        file_name: optionalString(args, "filename") ?? "image",
        category: (optionalString(args, "category") as never) ?? null,
        created_by_user_id: site.userId,
      });
      return {
        asset_id: assetId,
        upload_url: upload.uploadUrl,
        image_id: upload.imageId,
      };
    }
    case "confirm_media_upload": {
      const assetId = requiredString(args, "asset_id");
      const asset = await getMediaAsset(site.db, assetId, site.siteId);
      if (!asset?.cloudflare_image_id) throw new Error("Asset not found");
      const publicUrl = buildImageUrl(
        site.env,
        asset.cloudflare_image_id,
        "public",
      );
      const thumbnailUrl = buildImageUrl(
        site.env,
        asset.cloudflare_image_id,
        "thumbnail",
      );
      await activateMediaAsset(site.db, assetId, site.siteId, {
        public_url: publicUrl,
        thumbnail_url: thumbnailUrl,
      });
      return {
        asset_id: assetId,
        public_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        status: "active",
      };
    }
    case "update_media_asset": {
      const updated = await updateMediaAssetMetadata(
        site.db,
        requiredString(args, "asset_id"),
        site.siteId,
        {
          alt_text: optionalString(args, "alt_text") ?? undefined,
          location_id: optionalString(args, "location_id") ?? undefined,
          category: (optionalString(args, "category") as never) ?? undefined,
        },
      );
      return { updated };
    }
    case "delete_media_asset":
      await deleteMediaAsset(
        site.db,
        site.env,
        requiredString(args, "asset_id"),
        site.siteId,
      );
      return { deleted: true };
    case "import_menu_from_media": {
      const { extractMenuFromMediaAsset } =
        await import("~/server/utils/chowbot-media");
      return await extractMenuFromMediaAsset(site.db, site.env as never, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        userId: site.userId,
        assetId: requiredString(args, "asset_id"),
        menuName: optionalString(args, "menu_name") ?? undefined,
      });
    }
    case "get_page_content":
      return await getMergedEditorContent(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "page"),
        optionalString(args, "location_id") ?? undefined,
      );
    case "save_content_draft":
      return await saveContentDraft(
        site.db,
        site.organizationId,
        site.siteId,
        site.userId,
        {
          page: requiredString(args, "page"),
          changes: objectRecord(args.changes, "changes"),
          location_id: optionalString(args, "location_id"),
        },
      );
    case "get_content_draft_status":
      return await getContentDraftStatus(
        site.db,
        site.organizationId,
        site.siteId,
        optionalString(args, "page") ?? undefined,
        optionalString(args, "location_id") ?? undefined,
      );
    case "publish_content_drafts":
      return await publishContentDrafts(
        site.db,
        site.organizationId,
        site.siteId,
        {
          page: optionalString(args, "page") ?? undefined,
          location_id: optionalString(args, "location_id"),
          all: args.all === true,
        },
      );
    case "discard_content_drafts":
      return await discardContentDrafts(
        site.db,
        site.organizationId,
        site.siteId,
        {
          page: optionalString(args, "page") ?? undefined,
          location_id: optionalString(args, "location_id"),
          all: args.all === true,
        },
      );
    case "delete_content_field":
      return await deleteContentField(
        site.db,
        site.organizationId,
        site.siteId,
        {
          page: requiredString(args, "page"),
          field: requiredString(args, "field"),
          location_id: optionalString(args, "location_id"),
        },
      );
    case "list_location_qa":
      return {
        items: await listLocationQa(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "create_location_qa": {
      const result = await createLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        omit(args, ["location_id"]) as never,
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "update_location_qa":
      return await updateLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        requiredString(args, "qa_id"),
        omit(args, ["location_id", "qa_id"]),
      );
    case "delete_location_qa": {
      const result = await deleteLocationQa(
        site.db,
        site.siteId,
        requiredString(args, "location_id"),
        requiredString(args, "qa_id"),
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "reorder_location_qa":
      return await reorderLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        objectArray(args.updates, "updates").map((item) => {
          const sortOrder = item.sort_order;
          if (
            typeof sortOrder !== "number" ||
            !Number.isFinite(sortOrder) ||
            !Number.isInteger(sortOrder)
          ) {
            throw mcpProtocolError(
              MCP_ERROR.invalidParams,
              "Each update must have an integer sort_order",
            );
          }
          return { id: requiredString(item, "id"), sort_order: sortOrder };
        }),
      );
    case "list_location_reviews":
      return {
        reviews: await listLocationReviews(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "reply_to_review": {
      const result = await replyToReview(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "review_id"),
        requiredString(args, "reply"),
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "list_experiences":
      return {
        experiences: await listExperiences(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? undefined,
        }),
      };
    case "get_experience":
      return {
        experience: await getExperienceById(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
        ),
      };
    case "create_experience":
      return {
        experience: await createExperience(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
        ),
      };
    case "update_experience":
      return {
        experience: await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          omit(args, ["experience_id"]) as never,
        ),
      };
    case "delete_experience":
      return {
        deleted: await deleteExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
        ),
      };
    case "list_experience_bookings":
      return {
        bookings: await listExperienceBookings(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
        ),
      };
    case "update_experience_booking":
      return {
        booking: await updateBookingStatus(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          requiredString(args, "booking_id"),
          requiredString(args, "status") as
            | "pending"
            | "confirmed"
            | "cancelled",
        ),
      };
    case "list_locales":
      return await listSiteLocales(site.db, site.organizationId, site.siteId);
    case "upsert_locale":
      return {
        locale: await upsertSiteLocale(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
        ),
      };
    case "delete_locale":
      return await deleteSiteLocale(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
      );
    case "get_translation_inventory":
      return await buildTranslationInventory(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          includePublished: true,
        },
      );
    case "start_translation_job": {
      const job = await createTranslationJob(
        site.db,
        site.organizationId,
        site.siteId,
        site.userId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          includePublished: args.includePublished === true,
        },
      );
      const result = await processTranslationJobBatch(
        site.db,
        site.env,
        site.organizationId,
        site.siteId,
        job.id,
      );
      return { job, first_batch: result };
    }
    case "list_translation_jobs": {
      const rows = await site.db
        .prepare(
          `
        SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
               estimated_input_tokens, estimated_output_tokens, estimated_credits,
               actual_input_tokens, actual_output_tokens, actual_credits,
               processed_items, failed_items, error, created_at, updated_at, started_at, finished_at
        FROM translation_jobs
        WHERE organization_id = ? AND site_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `,
        )
        .bind(site.organizationId, site.siteId)
        .all();
      return { jobs: rows.results ?? [] };
    }
    case "get_translation_job": {
      const jobId = requiredString(args, "job_id");
      const job = await site.db
        .prepare(
          `
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `,
        )
        .bind(jobId, site.organizationId, site.siteId)
        .first();
      if (!job) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Translation job not found: ${jobId}`,
        );
      }
      const items = await site.db
        .prepare(
          `
        SELECT id, entity_type, entity_id, location_id, page, field, source_hash, source_chars, status, error, created_at, updated_at
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 500
      `,
        )
        .bind(jobId, site.organizationId, site.siteId)
        .all();
      return { job, items: items.results ?? [] };
    }
    case "run_translation_job_batch":
      return await processTranslationJobBatch(
        site.db,
        site.env,
        site.organizationId,
        site.siteId,
        requiredString(args, "job_id"),
      );
    case "get_translation_review_items":
      return await listTranslationReviewItems(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          status: (optionalString(args, "status") as never) ?? "all",
        },
      );
    case "save_translation_review_item":
      return await saveTranslationReviewItem(
        site.db,
        site.organizationId,
        site.siteId,
        {
          targetLocale: requiredString(args, "locale"),
          scope: parseScope(optionalString(args, "scope") ?? undefined),
          entityType: requiredString(args, "entity_type") as never,
          entityId: requiredString(args, "entity_id"),
          field: requiredString(args, "field"),
          fields: objectRecord(args.fields, "fields"),
        },
      );
    case "publish_translations":
      return await publishTranslationDrafts(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
        parseScope(optionalString(args, "scope") ?? undefined),
        site.userId,
      );
    case "list_contact_submissions":
      return {
        submissions: await listContactSubmissions(site.db, site.siteId),
      };
    case "update_contact_submission":
      return await updateContactSubmissionStatus(
        site.db,
        site.siteId,
        requiredString(args, "submission_id"),
        requiredString(args, "status"),
      );
    case "list_reservation_submissions":
      return {
        submissions: await listReservationSubmissions(site.db, site.siteId),
      };
    case "update_reservation_submission":
      return await updateReservationSubmissionStatus(
        site.db,
        site.siteId,
        requiredString(args, "submission_id"),
        requiredString(args, "status"),
      );
    case "get_notification_settings":
      return {
        notifications: await getNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_notification_settings":
      return {
        notifications: await updateNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "whatsapp_phone"),
        ),
      };
    case "get_google_business_connection":
      return {
        connection: await getGoogleBusinessLocationConnectionForMcp(
          site.env,
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "get_google_business_auth_url":
      return await getGoogleBusinessLocationAuthUrlForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        site.userId,
      );
    case "list_google_business_accounts":
      return await listGoogleBusinessAccountsForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
      );
    case "sync_google_business_locations":
      return await syncGoogleBusinessLocationsForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "account_id"),
        requiredStringArray(args, "location_ids"),
      );
    case "list_work_requests":
      return {
        requests: await listWorkRequestsForOrganization(
          site.db,
          site.organizationId,
        ),
      };
    case "create_work_request": {
      const result = await createWorkRequest(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        {
          type: requiredString(args, "type"),
          title: requiredString(args, "title"),
          description: optionalString(args, "description"),
          priority: optionalString(args, "priority"),
          source: "chowbot",
        },
      );
      assertDomainSuccess(result);
      return result.data;
    }
    case "save_generated_image": {
      if (!site.env.CLOUDFLARE_IMAGES_API_TOKEN || !site.env.CF_ACCOUNT_ID)
        throw new Error("Cloudflare Images not configured");
      const imageData = requiredString(args, "image_data");
      const prompt = optionalString(args, "prompt") ?? null;

      // imageData is base64 from image_generation_call.result (Responses API)
      const bytes = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0));
      const buffer = bytes.buffer as ArrayBuffer;

      const uploaded = await uploadImageBuffer(
        site.env as Parameters<typeof uploadImageBuffer>[0],
        buffer,
        `ai-hero-${Date.now()}.png`,
        "image/png",
      );

      const assetId = crypto.randomUUID();
      await createMediaAsset(site.db, {
        id: assetId,
        organization_id: site.organizationId,
        site_id: site.siteId,
        kind: "image",
        provider: "cloudflare_images",
        source: "generated",
        cloudflare_image_id: uploaded.imageId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        alt_text: prompt ?? "AI-generated hero image",
        status: "active",
        created_by_user_id: site.userId,
      });

      return {
        assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
      };
    }
    default:
      throw mcpProtocolError(
        MCP_ERROR.methodNotFound,
        `Unhandled tool: ${toolName}`,
      );
  }
}

function humanizeEntitlement(entitlement: string) {
  return entitlement
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function validateRequiredArguments(
  schema: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (
      !(key in args) ||
      args[key] === undefined ||
      args[key] === null ||
      args[key] === ""
    ) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        `Missing required argument: ${key}`,
      );
    }
  }
}

function isAllowedGoogleMapsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "maps.app.goo.gl" ||
    h === "maps.google.com" ||
    h === "google.com" ||
    h.endsWith(".google.com")
  );
}

function requiredString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value.trim();
}

function optionalString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredStringArray(value: unknown, key: string) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value.map((item) => item.trim());
}

function objectRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value as Record<string, string>;
}

function objectArray(value: unknown, key: string) {
  if (!Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  if (value.some((el) => el === null || typeof el !== "object" || Array.isArray(el))) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}: each element must be an object`);
  }
  return value as Record<string, unknown>[];
}

function omit(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keys.includes(key)),
  );
}

function normalizeChannels(
  value: unknown,
): Array<"site" | "gmb" | "instagram" | "facebook"> {
  if (!Array.isArray(value) || !value.length) return ["site"];
  return value.filter(
    (item): item is "site" | "gmb" | "instagram" | "facebook" =>
      item === "site" ||
      item === "gmb" ||
      item === "instagram" ||
      item === "facebook",
  );
}

async function loadSiteSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  const site = await db
    .prepare(
      `
    SELECT s.id, s.organization_id, s.subdomain, s.theme, s.status,
           s.primary_location_id, s.public_url, s.custom_domain_status, s.default_currency,
           s.brand_name, s.brand_description, s.logo_url, s.logo_asset_id, s.contact_email,
           s.settings, s.last_published_at, s.created_at, s.updated_at
    FROM sites s
    WHERE s.id = ? AND s.organization_id = ?
    LIMIT 1
  `,
    )
    .bind(siteId, organizationId)
    .first<Record<string, unknown>>();

  if (!site) throw new Error("Site not found");

  const settings =
    site.settings && typeof site.settings === "string"
      ? safeParseObject(site.settings)
      : {};

  return {
    ...site,
    url_structure: settings.url_structure ?? "location_subdirectories",
  };
}

function safeParseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function assertDomainSuccess(result: {
  status: number;
  data: Record<string, unknown>;
}) {
  if (result.status < 400) return;
  throw createError({
    statusCode: result.status,
    statusMessage: String(result.data.error ?? "Request failed"),
    data: result.data,
  });
}

function normalizeSiteCreationData(data: Record<string, unknown>) {
  const siteId = typeof data.siteId === "string"
    ? data.siteId
    : typeof data.id === "string"
      ? data.id
      : "";
  if (!siteId.trim()) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "Critical identifier siteId is empty or missing in site creation response",
    );
  }
  return {
    ...data,
    id: siteId,
    siteId,
    status: typeof data.status === "string" ? data.status : "active",
  };
}
