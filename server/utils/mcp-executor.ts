import { createError, type H3Event } from "h3";
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery } from "~/server/db";
import { createPreviewToken } from "~/server/utils/preview-token";
import { getFreeSiteDomain } from "~/server/utils/tenant-hosts";
import { hasSiteEntitlement } from "~/server/utils/billing";
import { getPageContent } from "~/server/utils/content-management";
import {
  uploadImageBuffer,
  hasCloudflareImagesConfig,
} from "~/server/utils/cloudflare-images";
import {
  createMediaAsset,
  deleteMediaAsset,
  getMediaAsset,
  listMediaAssets,
  updateMediaAssetMetadata,
} from "~/server/utils/media-asset-manager";
import { aggregateAnalyticsForRange } from "~/server/utils/analytics";
import {
  createLocation,
  deleteLocation,
  updateLocation,
} from "~/server/utils/location-management";
import { copyLocationBatch, type CopyEntityType } from "~/server/utils/copy-paste";
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
  createPlatformBlogPost,
  deletePlatformBlogPost,
  getPlatformBlogPost,
  listPlatformBlogPosts,
  updatePlatformBlogPost,
} from "~/server/utils/platform-content";
import {
  createExperience,
  deleteExperience,
  generateSlots,
  getExperienceById,
  getSlotAvailability,
  listExperienceBookings,
  listExperiences,
  listSlotOverrides,
  updateBookingStatus,
  updateExperience,
  upsertSlotOverride,
  type CreateExperienceInput,
  type UpdateExperienceInput,
  type WeekdayName,
} from "~/server/utils/experiences";
import {
  applyBookingPolicyPatch,
  getDirectBookingPolicy,
  renderBookingPolicySummary,
  resolveBookingPolicy,
  upsertBookingPolicy,
  validateBookingPolicyPatch,
  type BookingPolicyScopeType,
  type BookingPolicyType,
} from "~/server/utils/booking-policies";
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
import {
  createCustomDomainPair,
  deleteCustomDomain,
  domainInstructions,
  getSiteDomains,
  hasCustomDomainsEntitlement,
  setCanonicalDomain,
  syncDomainWithCloudflare,
  validateCustomDomain,
} from "~/server/utils/domains";
import { updateSiteSettingsFields } from "~/server/utils/site-settings";
import {
  getFacebookPagesConnection,
  getFacebookPages,
  getPageInfo,
  getLinkedInstagramAccount,
  publishToPage,
  publishToInstagram,
  storeFacebookPagesConnection,
  syncPageInfoToLocation,
} from "~/server/utils/facebook-pages";
import { getMcpTool } from "~/server/utils/mcp-tools";
import { requireMcpSite, requireMcpUser } from "~/server/utils/mcp-auth";
import {
  buildDashboardUrl,
  DASHBOARD_DESTINATIONS,
  type DashboardDestination,
} from "~/server/utils/dashboard-links";
import { mcpProtocolError, MCP_ERROR } from "~/server/utils/mcp-protocol";
import { renderStructuredResponse } from "~/server/utils/mcp-render";
import { isConversationalToolGroupEnabled } from "~/server/utils/conversational-tool-surface";
import {
  resolveMcpWorkspace,
  upsertMcpWorkspacePreference,
  type McpLocationSummary,
  type McpSiteSummary,
} from "~/server/utils/mcp-context";
import {
  getPlaceDetails,
  PlaceDetailsError,
  searchPlaces,
} from "~/server/utils/google-places";
import { chargeFlatCredits, type FlatCreditAction } from "~/server/utils/ai-credits";
import type { McpUserContext } from "~/server/utils/mcp-auth";
import type { SiteVertical } from "~/utils/vertical-copy";
import {
  deleteContentField,
  getEditorContent,
  getGoogleBusinessLocationAuthUrlForMcp,
  getGoogleBusinessLocationConnectionForMcp,
  getLocationForMcp,
  getNotificationsSettings,
  getSiteForMcp,
  listContactSubmissions,
  listGoogleBusinessAccountsForMcp,
  listLocationReviews,
  listReservationSubmissions,
  listSitesForUser,
  listWorkRequestsForOrganization,
  reorderLocationQa,
  syncGoogleBusinessLocationsForMcp,
  hydrateSeededLocationForOnboarding,
  updatePageContent,
  updateHomeHero,
  updateLocationQa,
  updateNotificationsSettings,
} from "~/server/utils/mcp-workflows";

// Prefers the user's active organization (session-based auth only — see
// McpUserContext.activeOrganizationId) and falls back to the oldest
// membership, matching the REST places endpoints. Never throws: billing
// failures must not surface as a Google Places tool failure.
async function chargeFlatCreditsForUser(
  user: McpUserContext,
  action: FlatCreditAction,
): Promise<void> {
  const activeOrgId = user.activeOrganizationId ?? "";
  const orgRow = await queryFirst<{ organizationId: string }>(user.db, `
    SELECT o.id AS organizationId FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC LIMIT 1
  `, [user.userId, activeOrgId]).catch(() => null);
  if (!orgRow) return;

  const result = await chargeFlatCredits(user.db, orgRow.organizationId, { action }).catch((error) => {
    console.error(`chargeFlatCredits threw for ${action}:`, error);
    return null;
  });
  if (result && !result.charged) {
    console.error(`chargeFlatCredits did not charge for ${action}`, {
      organizationId: orgRow.organizationId,
      newBalance: result.newBalance,
    });
  }
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
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

async function resolveGeneratedImageUpload(
  imageData: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const normalizedData = normalizeBase64Payload(imageData);
  const dataUrlMatch = imageData.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );
  if (dataUrlMatch) {
    const contentType = dataUrlMatch[1] || "image/png";
    const base64 = normalizeBase64Payload(dataUrlMatch[2] || "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const extension = extensionForContentType(contentType);
    return {
      buffer: bytes.buffer as ArrayBuffer,
      contentType,
      filename: `ai-generated.${extension}`,
    };
  }

  if (
    /^\/mnt\/data\//.test(imageData) ||
    /^\/tmp\//.test(imageData) ||
    /^file:\/\//.test(imageData)
  ) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "save_generated_image only accepts base64 image data or a data URL. Use save_generated_image_file for attachment-based uploads.",
    );
  }

  const bytes = Uint8Array.from(atob(normalizedData), (c) => c.charCodeAt(0));
  const contentType = detectImageContentType(bytes) ?? "image/png";
  const extension = extensionForContentType(contentType);
  return {
    buffer: bytes.buffer as ArrayBuffer,
    contentType,
    filename: `ai-generated-${Date.now()}.${extension}`,
  };
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

function validateImageBuffer(
  bytes: Uint8Array,
  sourceLabel: string,
): string {
  if (bytes.byteLength < 1024) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid image payload from ${sourceLabel}: payload too small.`,
    });
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Invalid image payload from ${sourceLabel}: payload exceeds 20 MB limit.`,
    });
  }

  const detectedContentType = detectImageContentType(bytes);
  if (!detectedContentType) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Invalid image payload from ${sourceLabel}: unsupported or unrecognized image bytes.`,
    );
  }

  return detectedContentType;
}

async function requireActiveImageAsset(
  db: D1Database,
  siteId: string,
  assetId: string,
  fieldName: string,
) {
  const asset = await getMediaAsset(db, assetId, siteId);
  if (!asset || asset.status !== "active" || asset.kind !== "image") {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `${fieldName} must reference an active image asset from this site.`,
    );
  }
  return asset;
}

/**
 * Expands the slot_start/slot_end/slot_interval_minutes/slot_weekday convenience args
 * (used by create_experience/update_experience) into a concrete time_slots array or a
 * recurring_slots[weekday] entry, then strips the convenience keys before they reach
 * createExperience/updateExperience.
 */
function expandSlotGeneratorArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { slot_start, slot_end, slot_interval_minutes, slot_weekday, ...rest } = args;
  if (slot_start === undefined && slot_end === undefined && slot_interval_minutes === undefined) {
    return rest;
  }
  if (typeof slot_start !== "string" || typeof slot_end !== "string" || typeof slot_interval_minutes !== "number") {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "slot_start, slot_end, and slot_interval_minutes must all be provided together.",
    );
  }
  const generated = generateSlots(slot_start, slot_end, slot_interval_minutes);
  if (slot_weekday !== undefined) {
    if (typeof slot_weekday !== "string") {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "slot_weekday must be a weekday name.");
    }
    const existingRecurring = (rest.recurring_slots as Record<string, string[]> | null | undefined) ?? {};
    const { time_slots: omittedTimeSlots, ...restWithoutTimeSlots } = rest;
    void omittedTimeSlots;
    return {
      ...restWithoutTimeSlots,
      recurring_slots: { ...existingRecurring, [slot_weekday as WeekdayName]: generated },
    };
  }
  const { recurring_slots: omittedRecurringSlots, ...restWithoutRecurringSlots } = rest;
  void omittedRecurringSlots;
  return { ...restWithoutRecurringSlots, time_slots: generated };
}

type GeneratedImageTarget =
  | "logo"
  | "home_hero"
  | "about_story_image"
  | "home_story_image"
  | "location_hero"
  | "post_image"
  | "menu_item_image"
  | "experience_image";

interface GeneratedImagePickerConfig {
  title: string;
  subtitle: string | null;
  useLabel: string | null;
  regenerateLabel: string | null;
  assignTool: string | null;
  assignArgs: Record<string, unknown> | null;
  regenerateTool: string | null;
  regenerateArgs: Record<string, unknown> | null;
  successMessage: string | null;
}

function assignmentForGeneratedTarget(
  target: GeneratedImageTarget,
  args: Record<string, unknown>,
  siteName?: string | null,
): {
  assignTool: string;
  assignArgs: Record<string, unknown>;
  title: string;
  subtitle: string | null;
  useLabel: string;
  successMessage: string;
} {
  const siteId = requiredString(args, "site_id");
  const forSite = siteName ? ` for ${siteName}` : "";
  switch (target) {
    case "logo":
      return {
        assignTool: "set_logo",
        assignArgs: { site_id: siteId },
        title: "Logo Concepts",
        subtitle: "Choose the mark that feels most like the brand.",
        useLabel: `Use as logo${forSite}`,
        successMessage: `Logo updated${forSite}.`,
      };
    case "home_hero":
      return {
        assignTool: "set_home_hero_image",
        assignArgs: { site_id: siteId },
        title: "Homepage Hero Images",
        subtitle: "Choose the image that best sets the tone for the homepage.",
        useLabel: `Use as homepage hero${forSite}`,
        successMessage: `Homepage hero image updated${forSite}.`,
      };
    case "about_story_image":
      return {
        assignTool: "set_about_story_image",
        assignArgs: { site_id: siteId },
        title: "Story Images",
        subtitle: "Choose the image that best tells the brand story on the About page.",
        useLabel: `Use as About story image${forSite}`,
        successMessage: `About page story image updated${forSite}.`,
      };
    case "home_story_image":
      return {
        assignTool: "set_home_story_image",
        assignArgs: { site_id: siteId },
        title: "Story Images",
        subtitle: "Choose the image that best tells the brand story on the homepage.",
        useLabel: `Use as homepage story image${forSite}`,
        successMessage: `Homepage story image updated${forSite}.`,
      };
    case "location_hero": {
      const locationId = requiredString(args, "location_id");
      return {
        assignTool: "set_location_hero_image",
        assignArgs: { site_id: siteId, location_id: locationId },
        title: "Location Hero Images",
        subtitle: "Choose the image that best represents this location.",
        useLabel: `Use as location hero${forSite}`,
        successMessage: `Location hero image updated${forSite}.`,
      };
    }
    case "post_image": {
      const postId = requiredString(args, "post_id");
      return {
        assignTool: "set_post_image",
        assignArgs: { site_id: siteId, post_id: postId },
        title: "Post Images",
        subtitle: "Choose the image that best fits this post.",
        useLabel: `Use for this post${forSite}`,
        successMessage: `Post image updated${forSite}.`,
      };
    }
    case "menu_item_image": {
      const menuItemId = requiredString(args, "menu_item_id");
      return {
        assignTool: "set_menu_item_image",
        assignArgs: { site_id: siteId, menu_item_id: menuItemId },
        title: "Menu Item Images",
        subtitle: "Choose the image that best sells this item.",
        useLabel: `Use for this menu item${forSite}`,
        successMessage: `Menu item image updated${forSite}.`,
      };
    }
    case "experience_image": {
      const experienceId = requiredString(args, "experience_id");
      return {
        assignTool: "set_experience_image",
        assignArgs: { site_id: siteId, experience_id: experienceId },
        title: "Experience Images",
        subtitle: "Choose the image that best captures the experience.",
        useLabel: `Use for this experience${forSite}`,
        successMessage: `Experience image updated${forSite}.`,
      };
    }
  }
}

function pickerConfigFromShowGeneratedImages(
  rawArguments: Record<string, unknown>,
  siteName?: string | null,
): GeneratedImagePickerConfig {
  const title = optionalString(rawArguments, "title");
  const subtitle = optionalString(rawArguments, "subtitle");
  const useLabel = optionalString(rawArguments, "use_label");
  const regenerateLabel = optionalString(rawArguments, "regenerate_label");
  const successMessage = optionalString(rawArguments, "success_message");
  const VALID_TARGETS = new Set<string>([
    "logo", "home_hero", "about_story_image", "home_story_image", "location_hero",
    "post_image", "menu_item_image", "experience_image",
  ]);
  const rawTargetStr = optionalString(rawArguments, "target");
  if (rawTargetStr !== null && !VALID_TARGETS.has(rawTargetStr)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid target: ${rawTargetStr}`);
  }
  const rawTarget = rawTargetStr as GeneratedImageTarget | null;

  if (!rawTarget) {
    return {
      title: title ?? "Generated Images",
      subtitle,
      useLabel,
      regenerateLabel,
      assignTool: null,
      assignArgs: null,
      regenerateTool: null,
      regenerateArgs: null,
      successMessage,
    };
  }

  const assignment = assignmentForGeneratedTarget(rawTarget, rawArguments, siteName);
  return {
    title: title ?? assignment.title,
    subtitle: subtitle ?? assignment.subtitle,
    useLabel: useLabel ?? assignment.useLabel,
    regenerateLabel,
    assignTool: assignment.assignTool,
    assignArgs: assignment.assignArgs,
    regenerateTool: null,
    regenerateArgs: null,
    successMessage: successMessage ?? assignment.successMessage,
  };
}

async function requireActiveVideoAsset(
  db: D1Database,
  siteId: string,
  assetId: string,
  fieldName: string,
) {
  const asset = await getMediaAsset(db, assetId, siteId);
  if (!asset || asset.status !== "active" || asset.kind !== "video") {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `${fieldName} must reference an active video asset from this site. Upload the video via the dashboard media library first, then call get_site_media_assets to find its asset id.`,
    );
  }
  return asset;
}

interface ToolFileReference {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

function toolFileReference(value: unknown, key: string): ToolFileReference {
  if (typeof value === "string" && value.trim()) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `${key} must be sent as a ChatGPT file argument so the host rewrites the local path into an authorized file reference before KrabiClaw receives it.`,
    );
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }

  const record = value as Record<string, unknown>;
  const downloadUrl = record.download_url;
  const fileId = record.file_id;
  if (typeof downloadUrl !== "string" || !downloadUrl.trim()) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Invalid ${key}.download_url`,
    );
  }
  if (typeof fileId !== "string" || !fileId.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}.file_id`);
  }

  return {
    download_url: downloadUrl.trim(),
    file_id: fileId.trim(),
    mime_type:
      typeof record.mime_type === "string" && record.mime_type.trim()
        ? record.mime_type.trim()
        : undefined,
    file_name:
      typeof record.file_name === "string" && record.file_name.trim()
        ? record.file_name.trim()
        : undefined,
  };
}

async function resolveUserUploadedImageFile(
  fileId: string,
  env: ApiRecord,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const accountId = env.CF_ACCOUNT_ID as string | undefined;
  const gatewayName = env.CF_GATEWAY_NAME as string | undefined;
  const aigToken = env.CLOUDFLARE_API_TOKEN as string | undefined;

  if (!accountId || !gatewayName || !aigToken) {
    throw new Error(
      "CF AI Gateway env vars not configured (CF_ACCOUNT_ID, CF_GATEWAY_NAME, CLOUDFLARE_API_TOKEN)",
    );
  }

  const normalizedFileId = fileId
    .trim()
    .replace(/^sediment:\/\//i, "")
    .replace(/^file:\/\//i, "")
    .replace(/^\/+/, "");

  if (!normalizedFileId || !/^[a-zA-Z0-9_-]+$/.test(normalizedFileId)) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "file_id must be a valid uploaded file identifier.",
    );
  }

  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/openai/v1/files/${normalizedFileId}/content`;
  const response = await fetch(url, {
    headers: { "cf-aig-authorization": `Bearer ${aigToken}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Failed to fetch uploaded file ${normalizedFileId} via AI Gateway: ${response.status}`,
    });
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `File ${normalizedFileId} is not an image.`,
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detectedContentType = validateImageBuffer(
    bytes,
    `file ${normalizedFileId}`,
  );
  const filename = `${normalizedFileId}.${detectedContentType.split("/")[1] ?? "png"}`;
  return { buffer, contentType: detectedContentType, filename };
}

async function resolveGeneratedImageFile(
  file: ToolFileReference,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const response = await fetch(file.download_url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Failed to download attachment ${file.file_id}: ${response.status}`,
    });
  }

  const contentType =
    file.mime_type ??
    response.headers.get("content-type") ??
    "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Attachment ${file.file_id} is not an image.`,
    );
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detectedContentType = validateImageBuffer(
    bytes,
    `attachment ${file.file_id}`,
  );
  const filename =
    file.file_name ??
    `${file.file_id}.${detectedContentType.split("/")[1] ?? "png"}`;
  return { buffer, contentType: detectedContentType, filename };
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

  const hasStrongSignals = lat != null && lng != null && (isChijId || isHexCid);

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
    allow_name_only_fallback:
      p.allow_name_only_fallback ??
      DEFAULT_MATCHING_POLICY.allow_name_only_fallback,
    require_coordinate_match:
      p.require_coordinate_match ??
      DEFAULT_MATCHING_POLICY.require_coordinate_match,
    max_distance_km:
      typeof p.max_distance_km === "number"
        ? p.max_distance_km
        : DEFAULT_MATCHING_POLICY.max_distance_km,
    prefer_backend_extraction:
      p.prefer_backend_extraction ??
      DEFAULT_MATCHING_POLICY.prefer_backend_extraction,
  };
}

function workspaceContextPayload(
  organization: Awaited<ReturnType<typeof resolveMcpWorkspace>>["organization"],
  site: McpSiteSummary | null,
  location: McpLocationSummary | null,
) {
  return {
    organization_id: organization?.id ?? site?.organization_id ?? null,
    organization_name: organization?.name ?? site?.organization_name ?? null,
    organization_slug: organization?.slug ?? site?.organization_slug ?? null,
    site_id: site?.id ?? null,
    site_name: site?.brand_name ?? site?.subdomain ?? null,
    site_subdomain: site?.subdomain ?? null,
    location_id: location?.id ?? null,
    location_slug: location?.slug ?? null,
    location_title: location?.title ?? null,
  };
}

function workspaceOrganizationsPayload(
  workspace: Awaited<ReturnType<typeof resolveMcpWorkspace>>,
) {
  return workspace.organizations.map((organization) => ({
    ...organization,
    active: organization.id === workspace.organization?.id,
  }));
}

function workspaceSitesPayload(
  workspace: Awaited<ReturnType<typeof resolveMcpWorkspace>>,
) {
  return workspace.sites.map((site) => ({
    id: site.id,
    organizationId: site.organization_id,
    organizationName: site.organization_name,
    name: site.brand_name ?? site.subdomain ?? site.id,
    subdomain: site.subdomain ?? "",
    orgSlug: site.organization_slug ?? "",
    publicUrl:
      site.public_url ??
      (site.subdomain ? `https://${site.subdomain}.krabiclaw.com` : null),
    status: site.status ?? "draft",
    active: site.id === workspace.site?.id,
  }));
}

function workspaceLocationsPayload(
  workspace: Awaited<ReturnType<typeof resolveMcpWorkspace>>,
) {
  return workspace.locations.map((location) => ({
    ...location,
    active: location.id === workspace.location?.id,
  }));
}

async function mutationContextPayload(
  site: {
    db: D1Database;
    userId: string;
    isPlatformAdmin: boolean;
    siteId: string;
  },
  options: {
    organizationId?: string | null;
    locationId?: string | null;
  } = {},
) {
  const workspace = await resolveMcpWorkspace(
    site.db,
    site.userId,
    site.isPlatformAdmin,
    {
      organizationId: options.organizationId ?? null,
      siteId: site.siteId,
      locationId: options.locationId ?? null,
    },
  );
  return workspaceContextPayload(
    workspace.organization,
    workspace.site,
    workspace.location,
  );
}

async function resolveMenuLocationId(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menuId: string,
) {
  const row = await queryFirst<{ location_id: string | null }>(
    db,
    `
      SELECT location_id
      FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `,
    [menuId, organizationId, siteId],
  );
  return row?.location_id ?? null;
}

function toolRequiresArgument(
  schema: Record<string, unknown>,
  key: string,
) {
  return Array.isArray(schema.required) && schema.required.includes(key);
}

function rethrowWorkspaceError(error: unknown): never {
  if (error instanceof Error && error.message) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, error.message);
  }
  throw error;
}

async function normalizeWorkspaceArguments(
  event: H3Event,
  toolName: string,
  schema: Record<string, unknown>,
  rawArguments: Record<string, unknown>,
) {
  const args = { ...rawArguments };

  if (["get_current_user", "get_workspace_context", "set_workspace_context", "import_from_maps", "list_sites", "create_site"].includes(toolName)) {
    return args;
  }

  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};
  const supportsSite = "site_id" in properties;
  const supportsLocation = "location_id" in properties;
  const needsLocation = toolRequiresArgument(schema, "location_id");
  const hasSite = typeof args.site_id === "string" && args.site_id.trim();
  const hasLocation = typeof args.location_id === "string" && args.location_id.trim();

  if (!supportsSite && !needsLocation) {
    return args;
  }

  if ((!supportsSite || hasSite) && (!needsLocation || hasLocation)) {
    return args;
  }

  const user = await requireMcpUser(event);
  let workspace;
  try {
    workspace = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
      {
        siteId: hasSite ? String(args.site_id) : null,
        locationId: hasLocation ? String(args.location_id) : null,
        requireSite: supportsSite || needsLocation,
        requireLocation: needsLocation,
      },
    );
  } catch (error) {
    rethrowWorkspaceError(error);
  }

  if (!hasSite && supportsSite && workspace.site) {
    args.site_id = workspace.site.id;
  }
  if (!hasLocation && supportsLocation && workspace.location && needsLocation) {
    args.location_id = workspace.location.id;
  }

  return args;
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

  const normalizedArguments = await normalizeWorkspaceArguments(
    event,
    toolName,
    tool.inputSchema,
    rawArguments,
  );

  validateRequiredArguments(tool.inputSchema, normalizedArguments);

  if (toolName === "list_sites") {
    const user = await requireMcpUser(event);
    const userRecord = await queryFirst<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
    }>(user.db, `SELECT id, email, name, role FROM user WHERE id = ? LIMIT 1`, [user.userId]);
    const allSites = await listSitesForUser(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    const workspaceSitesById = new Map(workspace.sites.map((site) => [site.id, site] as const));
    const sites = allSites.map((s: Record<string, unknown>) => ({
      id: s.id,
      organizationId: s.organization_id,
      organizationName: workspaceSitesById.get(String(s.id))?.organization_name ?? null,
      name: s.brand_name ?? s.slug,
      subdomain: s.subdomain,
      orgSlug: s.slug,
      publicUrl: s.subdomain ? `https://${s.subdomain}.krabiclaw.com` : null,
      status: s.status ?? "draft",
      active: s.id === workspace.site?.id,
    }));
    const currentUser = {
      id: user.userId,
      email: userRecord?.email ?? null,
      name: userRecord?.name ?? null,
      role: userRecord?.role ?? null,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    return renderStructuredResponse(
      { sites, currentUser },
      sites.length === 0
        ? "Welcome to KrabiClaw. You have no sites yet — let's create one."
        : `You have ${sites.length} site${sites.length > 1 ? "s" : ""}: ${sites.map((s: { name: unknown }) => s.name).join(", ")}.`,
    );
  }

  if (toolName === "get_current_user") {
    const user = await requireMcpUser(event);
    const currentUser = await queryFirst<{
      id: string;
      email: string | null;
      name: string | null;
      role: string | null;
    }>(
      user.db,
      `
        SELECT id, email, name, role
        FROM user
        WHERE id = ?
        LIMIT 1
      `,
      [user.userId],
    );

    if (!currentUser) {
      throw createError({
        statusCode: 404,
        statusMessage: "Current user not found",
      });
    }

    return {
      user: {
        ...currentUser,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }

  if (toolName === "get_workspace_context") {
    const user = await requireMcpUser(event);
    const workspace = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
    );
    return {
      context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
      organizations: workspaceOrganizationsPayload(workspace),
      sites: workspaceSitesPayload(workspace),
      locations: workspaceLocationsPayload(workspace),
    };
  }

  if (toolName === "set_workspace_context") {
    const user = await requireMcpUser(event);
    const organizationId = optionalString(normalizedArguments, "organization_id");
    const siteId = optionalString(normalizedArguments, "site_id");
    const locationId = optionalString(normalizedArguments, "location_id");
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        user.db,
        user.userId,
        user.isPlatformAdmin,
        {
          organizationId,
          siteId,
          locationId,
          requireSite: Boolean(siteId) || Boolean(locationId),
          requireLocation: Boolean(locationId),
        },
      );
      if (!workspace.organization && !workspace.site && !workspace.location) {
        throw new Error("Workspace context is empty. At least one of organization, site, or location must be resolved.");
      }
    } catch (error) {
      rethrowWorkspaceError(error);
    }

    await upsertMcpWorkspacePreference(user.db, {
      userId: user.userId,
      organizationId: workspace.site?.organization_id ?? workspace.organization?.id ?? null,
      siteId: workspace.site?.id ?? null,
      locationId: locationId ? workspace.location?.id ?? null : workspace.location?.id ?? null,
    });

    const refreshed = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
      {
        organizationId: workspace.organization?.id ?? null,
        siteId: workspace.site?.id ?? null,
        locationId: workspace.location?.id ?? null,
      },
    );

    return {
      success: true,
      context: workspaceContextPayload(refreshed.organization, refreshed.site, refreshed.location),
      organizations: workspaceOrganizationsPayload(refreshed),
      sites: workspaceSitesPayload(refreshed),
      locations: workspaceLocationsPayload(refreshed),
    };
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

    const rawUrl = requiredString(normalizedArguments, "maps_url");

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

    const hint = (normalizedArguments.parsed_hint ?? null) as ParsedHint | null;
    const policy = resolveMatchingPolicy(normalizedArguments.matching_policy);

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
    if (
      hint?.lat != null &&
      hint?.lng != null &&
      backendParsed.lat != null &&
      backendParsed.lng != null
    ) {
      const divergenceKm = haversineKm(
        hint.lat,
        hint.lng,
        backendParsed.lat,
        backendParsed.lng,
      );
      if (divergenceKm > 1) {
        console.warn(
          "[import_from_maps] parsed_hint diverges from backend extraction",
          {
            hint: { lat: hint.lat, lng: hint.lng },
            backendParsed: { lat: backendParsed.lat, lng: backendParsed.lng },
            divergenceKm: Math.round(divergenceKm * 10) / 10,
          },
        );
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
      let results;
      try {
        results = await searchPlaces(apiKey, nameHint, locationBias);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Google Places search failed.";
        throw createError({
          statusCode: 502,
          statusMessage: message,
        });
      }
      await chargeFlatCreditsForUser(user, "google_places_search");
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

    if (!placeId)
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "Could not resolve a place ID from that URL.",
      );
    let details;
    try {
      details = await getPlaceDetails(apiKey, placeId, true);
    } catch (error) {
      const message =
        error instanceof PlaceDetailsError || error instanceof Error
          ? error.message
          : "Google Places detail lookup failed.";
      throw createError({
        statusCode: 502,
        statusMessage: message,
      });
    }
    await chargeFlatCreditsForUser(user, "google_places_details");

    // Upload Google Photos to Cloudflare Images for stable preview URLs.
    // We don't have an org/site yet, so we do NOT persist media_asset rows here.
    // The returned cfImageId lets the model create proper media_assets after create_site.
    const photos: Array<{ cfImageId: string; publicUrl: string }> = [];
    const hasImagesConfig = hasCloudflareImagesConfig(user.env);

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

    return renderStructuredResponse(
      structuredContent,
      `Imported: ${details.name} — ${details.formattedAddress}. ${photos.length} photo${photos.length !== 1 ? "s" : ""} found.`,
    );
  }

  if (toolName === "show_generated_images") {
    await requireMcpUser(event);
    const raw = objectArray(normalizedArguments.images, "images");
    if (raw.length === 0) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "images must be non-empty. First persist each image with save_generated_image or save_generated_image_file, then pass the assetId and publicUrl here.",
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
          "Each image must have a non-empty assetId and publicUrl returned by save_generated_image or save_generated_image_file.",
        );
      }
    }
    const images = raw.map((img) => ({
      assetId: img.assetId as string,
      publicUrl: img.publicUrl as string,
    }));

    let activeSiteName: string | null = null;
    const rawSiteId = optionalString(normalizedArguments, "site_id");
    const rawTargetForName = optionalString(normalizedArguments, "target");
    if (rawTargetForName && rawSiteId) {
      const authorizedSite = await requireMcpSite(event, rawSiteId, "editor");
      const siteRow = await queryFirst<{ brand_name: string | null; subdomain: string | null }>(
        authorizedSite.db,
        `
          SELECT brand_name, subdomain
          FROM sites
          WHERE id = ? AND organization_id = ?
          LIMIT 1
        `,
        [authorizedSite.siteId, authorizedSite.organizationId],
      );
      const nameVal = siteRow?.brand_name?.trim();
      activeSiteName = (nameVal ? nameVal : siteRow?.subdomain) ?? null;
    }

    const picker = pickerConfigFromShowGeneratedImages(normalizedArguments, activeSiteName);
    const isDebug = normalizedArguments.debug === true;
    return renderStructuredResponse(
      {
        title: picker.title,
        subtitle: picker.subtitle,
        images,
        useLabel: picker.useLabel,
        regenerateLabel: picker.regenerateLabel,
        assignTool: picker.assignTool,
        assignArgs: picker.assignArgs,
        regenerateTool: picker.regenerateTool,
        regenerateArgs: picker.regenerateArgs,
        successMessage: picker.successMessage,
        ...(isDebug ? {
          debug: true,
          debugLabel: "show_generated_images debug",
          debugExpectedImageDomain: "https://imagedelivery.net",
        } : {}),
      },
      `${images.length} AI-generated image${images.length !== 1 ? "s" : ""} ready to review.`,
    );
  }

  if (toolName === "create_site") {
    const user = await requireMcpUser(event);
    const result = await runSiteCreation(user.env, user.db, user.userId, {
      name: requiredString(normalizedArguments, "name"),
      subdomain: requiredString(normalizedArguments, "subdomain"),
      vertical: requiredString(normalizedArguments, "vertical") as SiteVertical,
    });
    assertDomainSuccess(result);
    const normalized = normalizeSiteCreationData(result.data);
    const createdSite = await resolveMcpWorkspace(
      user.db,
      user.userId,
      user.isPlatformAdmin,
      { siteId: normalized.siteId, requireSite: true },
    );
    await upsertMcpWorkspacePreference(user.db, {
      userId: user.userId,
      organizationId: createdSite.site?.organization_id ?? null,
      siteId: createdSite.site?.id ?? normalized.siteId,
      locationId: createdSite.location?.id ?? null,
    });
    return normalized;
  }

  const siteId = requiredString(normalizedArguments, "site_id");
  const site = await requireMcpSite(event, siteId, tool.minimumRole);
  const args = omit(normalizedArguments, ["site_id"]);
  const explicitSiteId = optionalString(rawArguments, "site_id");
  const explicitLocationId = optionalString(rawArguments, "location_id");

  if (explicitSiteId || explicitLocationId) {
    let workspace;
    try {
      workspace = await resolveMcpWorkspace(
        site.db,
        site.userId,
        site.isPlatformAdmin,
        {
          siteId: site.siteId,
          locationId: explicitLocationId,
          requireSite: true,
          requireLocation: Boolean(explicitLocationId),
        },
      );
    } catch (error) {
      rethrowWorkspaceError(error);
    }
    await upsertMcpWorkspacePreference(site.db, {
      userId: site.userId,
      organizationId: workspace.site?.organization_id ?? site.organizationId,
      siteId: workspace.site?.id ?? site.siteId,
      locationId: workspace.location?.id ?? null,
    });
  }

  if (
    tool.requiredEntitlement &&
    !(await hasSiteEntitlement(
      site.db,
      site.siteId,
      tool.requiredEntitlement,
    ))
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: `${humanizeEntitlement(tool.requiredEntitlement)} is not enabled for this site.`,
    });
  }

  switch (toolName) {
    case "show_site_preview": {
      const siteRow = await getSiteForMcp(
        site.db,
        site.siteId,
        site.userId,
        site.isPlatformAdmin,
      );
      const subdomain = (siteRow as Record<string, unknown>).subdomain as string | null | undefined;
      const customDomain = (siteRow as Record<string, unknown>).custom_domain as string | null | undefined;
      const platformDomain = (site.env as Record<string, unknown>).NUXT_PUBLIC_PLATFORM_DOMAIN as string | undefined
        || "https://krabiclaw.com";
      const freeSiteDomain = getFreeSiteDomain(site.env as { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string; NUXT_PUBLIC_PLATFORM_DOMAIN?: string });
      const previewSecret = (site.env as Record<string, unknown>).PREVIEW_SECRET as string | undefined;
      let previewUrl = `${platformDomain}/preview/site/${site.siteId}`;
      if (previewSecret) {
        const token = await createPreviewToken(previewSecret, site.siteId, Date.now() + 60 * 60 * 1000);
        previewUrl = `${previewUrl}?preview=true&token=${token}`;
      }
      const publicUrl = customDomain
        ? `https://${customDomain}`
        : subdomain
          ? `https://${subdomain}.${freeSiteDomain}`
          : previewUrl;
      const locationRows = await queryAll<{
        slug: string;
        title: string;
        hero_image_public_url: string | null;
      }>(
        site.db,
        `SELECT bl.slug, bl.title, ma.public_url AS hero_image_public_url
         FROM business_locations bl
         LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
         WHERE bl.site_id = ?
         ORDER BY bl.is_primary DESC, bl.title ASC
         LIMIT 5`,
        [site.siteId],
      );
      const locationPages = locationRows.map((loc) => ({
        label: loc.title,
        path: `/locations/${loc.slug}`,
      }));
      const pages = [{ label: "Home", path: "/" }, ...locationPages];
      const ogImageUrl = locationRows[0]?.hero_image_public_url ?? null;
      const siteName = String((siteRow as Record<string, unknown>).brand_name ?? subdomain ?? site.siteId);
      return renderStructuredResponse(
        {
          site: {
            id: site.siteId,
            name: siteName,
            subdomain: subdomain ?? null,
            publicUrl,
            previewUrl,
          },
          pages,
          ogImageUrl,
        },
        subdomain ? `Your site is live at ${publicUrl}` : `Your site preview is ready — ${siteName}`,
      );
    }
    case "get_site":
      {
        const siteRecord = await getSiteForMcp(
          site.db,
          site.siteId,
          site.userId,
          site.isPlatformAdmin,
        );
        const workspace = await resolveMcpWorkspace(
          site.db,
          site.userId,
          site.isPlatformAdmin,
          { siteId: site.siteId },
        );
        return {
          site: siteRecord,
          context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
        };
      }
    case "get_site_settings":
      return {
        settings: await loadSiteSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_site_settings": {
      const { forceSubdomainRegistrationFailure, ...updates } = args as Record<
        string,
        unknown
      >;
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        updates,
        site.userId,
        {
          forceSubdomainRegistrationFailure: Boolean(
            forceSubdomainRegistrationFailure,
          ),
        },
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site),
      };
    }
    case "set_default_currency": {
      const { isCurrencyCode } = await import("~/shared/currencies");
      const currency = String(args.currency ?? "").toUpperCase().trim();
      if (!isCurrencyCode(currency)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported currency: ${currency}`);
      }
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { default_currency: currency },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        default_currency: currency,
        updated: true,
        context: await mutationContextPayload(site),
      };
    }
    case "set_logo": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { logo_asset_id: assetId },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        id: site.siteId,
        updated: true,
        logo_asset_id: assetId,
        context: await mutationContextPayload(site),
      };
    }
    case "set_brand_color": {
      const { resolveColor } = await import("~/utils/color-utils");
      const colorInput = requiredString(args, "color");
      const resolvedColor = resolveColor(colorInput);
      if (!resolvedColor) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported color: ${colorInput}`);
      }
      const result = await updateSiteSettingsFields(
        site.db,
        site.env,
        site.siteId,
        site.organizationId,
        { brand_color: resolvedColor },
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        brand_color: resolvedColor,
        updated: true,
        description: `Set brand color to ${resolvedColor} from "${colorInput}"`,
        context: await mutationContextPayload(site),
      };
    }
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        site.db,
        site.userId,
        site.isPlatformAdmin,
        { siteId: site.siteId },
      );
      return {
        context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
        locations: workspaceLocationsPayload(workspace),
      };
    }
    case "get_location":
      {
        const locationId = requiredString(args, "location_id");
        const workspace = await resolveMcpWorkspace(
          site.db,
          site.userId,
          site.isPlatformAdmin,
          { siteId: site.siteId, locationId },
        );
        return {
          location: await getLocationForMcp(
          site.db,
          site.organizationId,
          site.siteId,
            locationId,
          ),
          context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
        };
      }
    case "create_location": {
      const result = await createLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        args as never,
        site.userId,
      );
      if (
        result.status === 402 &&
        (result.data as { code?: string } | undefined)?.code ===
          "LOCATION_LIMIT_REACHED"
      ) {
        return await hydrateSeededLocationForOnboarding(
          site.db,
          site.organizationId,
          site.siteId,
          site.userId,
          args,
        );
      }
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, {
          locationId:
            typeof (result.data as { location?: { id?: string } }).location?.id === "string"
              ? (result.data as { location: { id: string } }).location.id
              : null,
        }),
      };
    }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        omit(args, ["location_id"]) as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "copy_location_batch": {
      const VALID_ENTITY_TYPES: CopyEntityType[] = [
        "menus", "menu_items", "media_assets", "site_content", "reviews", "location_qa", "experiences",
      ];
      const sourceLocationId = requiredString(args, "source_location_id");
      const targetLocationId = optionalString(args, "target_location_id");
      const newLocationTitle = optionalString(args, "new_location_title");
      if (!targetLocationId && !newLocationTitle) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Provide either target_location_id (to copy into an existing location) or new_location_title (to create a new one).",
        );
      }
      const entityTypes = requiredStringArray(args.entities, "entities");
      if (entityTypes.length === 0) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "entities must include at least one content type to copy.");
      }
      for (const type of entityTypes) {
        if (!VALID_ENTITY_TYPES.includes(type as CopyEntityType)) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            `Invalid entity type "${type}". Must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
          );
        }
      }
      const includeTranslations = args.include_translations !== false;

      const result = await copyLocationBatch(
        site.env as unknown as Record<string, string | undefined>,
        site.db,
        site.organizationId,
        site.siteId,
        site.userId,
        {
          source_location_id: sourceLocationId,
          target_location_id: targetLocationId ?? undefined,
          new_location: newLocationTitle ? { title: newLocationTitle } : undefined,
          entities: entityTypes.map((type) => ({
            type: type as CopyEntityType,
            include_translations: includeTranslations,
          })),
        },
      );

      if (!result.success) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, result.error ?? "Failed to copy location data");
      }

      return {
        manifest: result.manifest,
        context: await mutationContextPayload(site, { locationId: result.manifest?.target_location_id ?? null }),
      };
    }
    case "set_location_hero_image": {
      const locationId = requiredString(args, "location_id");
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const currentLocation = await getLocationForMcp(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
      ) as { hero_video_asset_id?: string | null };
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_image_asset_id: assetId } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        ...(currentLocation.hero_video_asset_id
          ? {
              warning:
                "This location already has a hero video, which takes display priority over a hero image. The video will keep showing. Call clear_location_hero_video first if you want this image to display instead.",
            }
          : {}),
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "set_location_hero_video": {
      const locationId = requiredString(args, "location_id");
      const assetId = requiredString(args, "asset_id");
      await requireActiveVideoAsset(site.db, site.siteId, assetId, "asset_id");
      const currentLocation = await getLocationForMcp(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
      ) as { hero_image_asset_id?: string | null };
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_video_asset_id: assetId } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        ...(currentLocation.hero_image_asset_id
          ? {
              warning:
                "This location already has a hero image, but the new hero video will take display priority over it.",
            }
          : {}),
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "clear_location_hero_image": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_image_asset_id: null } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "clear_location_hero_video": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_video_asset_id: null } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "delete_location": {
      const locationId = requiredString(args, "location_id");
      const result = await deleteLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
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
      {
        const menu = await createMenu(
          site.db,
          site.organizationId,
          site.siteId,
          {
            name: requiredString(args, "name"),
            description: optionalString(args, "description") ?? undefined,
            locationId: optionalString(args, "location_id") ?? null,
          },
          site.userId,
        );
        return {
          menu,
          context: await mutationContextPayload(site, {
            locationId:
              typeof menu.location_id === "string" ? menu.location_id : null,
          }),
        };
      }
    case "update_menu":
      {
        const menu = await updateMenu(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
          omit(args, ["menu_id"]) as never,
          site.userId,
        );
        return {
          menu,
          context: await mutationContextPayload(site, {
            locationId: typeof menu.location_id === "string" ? menu.location_id : null,
          }),
        };
      }
    case "delete_menu":
      {
        const menuId = requiredString(args, "menu_id");
        const locationId = await resolveMenuLocationId(site.db, site.organizationId, site.siteId, menuId);
        await deleteMenu(site.db, site.organizationId, site.siteId, menuId);
        return { deleted: true, context: await mutationContextPayload(site, { locationId }) };
      }
    case "create_menu_item": {
      const createMenuItemArgs = normalizeMenuItemArgs(args, {
        requireSection: true,
      });
      const item = await createMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(createMenuItemArgs, "menu_id"),
          omit(createMenuItemArgs, ["menu_id", "price"]) as never,
          site.userId,
        );
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(
            site.db,
            site.organizationId,
            site.siteId,
            item.menu_id,
          ),
        }),
      };
    }
    case "add_menu_items_batch": {
      const menuId = requiredString(args, "menu_id");
      const menu = await getMenuWithItems(
        site.db,
        site.organizationId,
        site.siteId,
        menuId,
      );
      if (!menu) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Menu not found.");
      }

      const rawItems = args.items;
      if (!Array.isArray(rawItems)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "items must be an array.",
        );
      }

      if (rawItems.length > 100) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Maximum 100 items allowed per batch request.",
        );
      }
      const items = rawItems;
      const existingKeys = new Set(
        menu.items.map((item) => item.slug || menuItemLookupKey(item.name)),
      );
      const inputKeys = new Set<string>();
      const created: Array<{
        id: string;
        name: string;
        section: string;
        price_amount: string | number | null;
      }> = [];
      const skipped: Array<{
        name: string;
        reason: string;
        existing_item_id?: string;
      }> = [];

      for (const item of items) {
        const itemRecord =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : null;
        const name = itemRecord ? toolString(itemRecord, "name", 200)?.trim() : "";
        if (!itemRecord || !name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }

        const section = itemRecord
          ? toolString(itemRecord, "section", 100)?.trim()
          : "";
        if (!section) {
          skipped.push({ name, reason: "missing_section" });
          continue;
        }

        const key = menuItemLookupKey(name);
        const existing = menu.items.find(
          (menuItem) =>
            menuItem.slug === key ||
            menuItem.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing || existingKeys.has(key)) {
          skipped.push({
            name,
            reason: "already_exists",
            existing_item_id: existing?.id,
          });
          continue;
        }
        if (inputKeys.has(key)) {
          skipped.push({ name, reason: "duplicate_in_request" });
          continue;
        }

        inputKeys.add(key);

        const createMenuItemArgs = normalizeMenuItemArgs(itemRecord, {
          requireSection: true,
        });
        try {
          const createdItem = await createMenuItem(
            site.db,
            site.organizationId,
            site.siteId,
            menuId,
            createMenuItemArgs as never,
            site.userId,
          );
          existingKeys.add(
            createdItem.slug || menuItemLookupKey(createdItem.name),
          );
          created.push({
            id: createdItem.id,
            name: createdItem.name,
            section: createdItem.section,
            price_amount: createdItem.price_amount,
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          skipped.push({ name, reason: "unique_conflict" });
        }
      }

      return { added: created.length, created, skipped, menu_id: menuId };
    }
    case "update_menu_item": {
      const updateMenuItemArgs = normalizeMenuItemArgs(args, {
        requireSection: false,
      });
      const item = await updateMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(updateMenuItemArgs, "menu_item_id"),
          omit(updateMenuItemArgs, ["menu_item_id", "price"]) as never,
          site.userId,
        );
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, item.menu_id),
        }),
      };
    }
    case "set_menu_item_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const item = await updateMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_item_id"),
          { image_asset_id: assetId } as never,
          site.userId,
        );
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(
            site.db,
            site.organizationId,
            site.siteId,
            item.menu_id,
          ),
        }),
      };
    }
    case "delete_menu_item": {
      const deleted = await deleteMenuItem(
        site.db,
        requiredString(args, "menu_item_id"),
        site.organizationId,
        site.siteId,
        site.userId,
      );
      if (!deleted) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Menu item not found or does not belong to this site.");
      }
      return { deleted: true };
    }
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
          optionalString(args, "location_id") ?? undefined,
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
      {
        const post = await createPost(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
          site.userId,
        );
        return {
          post,
          context: await mutationContextPayload(site, {
            locationId: post && typeof post.location_id === "string" ? post.location_id : null,
          }),
        };
      }
    case "update_post":
      {
        const post = await updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          omit(args, ["post_id"]) as never,
          site.userId,
        );
        return {
          post,
          context: await mutationContextPayload(site, {
            locationId:
              post && typeof post.location_id === "string"
                ? post.location_id
                : null,
          }),
        };
      }
    case "set_post_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const post = await updatePost(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "post_id"),
          { image_asset_id: assetId },
          site.userId,
        );
      return {
        post,
        context: await mutationContextPayload(site, {
          locationId: post && typeof post.location_id === "string" ? post.location_id : null,
        }),
      };
    }
    case "publish_post": {
      const channels = normalizeChannelsInput(args);
      if (
        channels.some((channel) => channel !== "site") &&
        !isConversationalToolGroupEnabled(site.env, "social_publishing")
      ) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Social publishing is not exposed on this conversational surface. Publish to the site here, or use the dashboard for Facebook, Instagram, and Google Business publishing.",
        );
      }
      const postId = requiredString(args, "post_id");
      const wantsFacebook = channels.includes("facebook");
      const wantsInstagram = channels.includes("instagram");

      if (wantsFacebook || wantsInstagram) {
        if (!(await hasSiteEntitlement(site.db, site.siteId, "managed_service"))) {
          throw createError({
            statusCode: 403,
            statusMessage:
              "Facebook and Instagram publishing require a Managed or SEO Accelerator plan.",
          });
        }
        const connection = await getFacebookPagesConnection(
          site.env as never,
          site.organizationId,
          site.siteId,
        ).catch(() => null);
        if (!connection?.facebook_page_id || !connection.encrypted_page_token) {
          throw createError({
            statusCode: 409,
            statusMessage:
              "Connect a Facebook Page before publishing to Facebook or Instagram.",
          });
        }
      }

      const post = await publishPost(
        site.db,
        site.organizationId,
        site.siteId,
        postId,
        channels,
      );
      if (!post)
        throw createError({ statusCode: 404, statusMessage: "Post not found" });
      const now = new Date().toISOString();

      if (wantsFacebook || wantsInstagram) {
        const connection = await getFacebookPagesConnection(
          site.env as never,
          site.organizationId,
          site.siteId,
        ).catch(() => null);
        if (!connection?.facebook_page_id || !connection.encrypted_page_token) {
          const msg = "No Facebook Page connected";
          const queries: BatchQuery[] = [];
          if (wantsFacebook)
            queries.push({
              query: `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'facebook'`,
              params: [msg, postId],
            });
          if (wantsInstagram)
            queries.push({
              query: `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`,
              params: [msg, postId],
            });
          // Both channel-skip updates commit atomically via executeBatch, matching
          // the original db.batch() semantics.
          if (queries.length) await executeBatch(site.db, queries);
        } else {
          const pageToken = connection.encrypted_page_token;
          const pageId = connection.facebook_page_id;

          let imageUrl: string | null = null;
          if (post.image_asset_id) {
            const asset = await queryFirst<{ public_url: string | null }>(
              site.db,
              `SELECT public_url FROM media_assets WHERE id = ? AND status = 'active' LIMIT 1`,
              [post.image_asset_id],
            );
            imageUrl = asset?.public_url ?? null;
          }

          if (wantsFacebook) {
            try {
              const fbResult = await publishToPage(pageToken, pageId, {
                message: post.body,
              });
              await execute(
                site.db,
                `UPDATE post_channel_jobs SET status = 'published', provider_post_id = ?, published_at = ? WHERE post_id = ? AND channel = 'facebook'`,
                [fbResult.id, now, postId],
              );
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : "Facebook publish failed";
              await execute(
                site.db,
                `UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'facebook'`,
                [msg, postId],
              );
            }
          }

          if (wantsInstagram) {
            if (!imageUrl) {
              await execute(
                site.db,
                `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`,
                ["Instagram requires an image — add a photo to this post", postId],
              );
            } else {
              try {
                const igUserId = await getLinkedInstagramAccount(
                  pageToken,
                  pageId,
                );
                if (!igUserId) {
                  await execute(
                    site.db,
                    `UPDATE post_channel_jobs SET status = 'skipped', error = ? WHERE post_id = ? AND channel = 'instagram'`,
                    ["No Instagram Business account linked to this Facebook Page", postId],
                  );
                } else {
                  const igResult = await publishToInstagram(
                    pageToken,
                    igUserId,
                    { caption: post.body, imageUrl },
                  );
                  await execute(
                    site.db,
                    `UPDATE post_channel_jobs SET status = 'published', provider_post_id = ?, published_at = ? WHERE post_id = ? AND channel = 'instagram'`,
                    [igResult.id, now, postId],
                  );
                }
              } catch (err) {
                const msg =
                  err instanceof Error
                    ? err.message
                    : "Instagram publish failed";
                await execute(
                  site.db,
                  `UPDATE post_channel_jobs SET status = 'failed', error = ? WHERE post_id = ? AND channel = 'instagram'`,
                  [msg, postId],
                );
              }
            }
          }
        }
      }

      return {
        post: await getPost(site.db, site.organizationId, site.siteId, postId),
        context: await mutationContextPayload(site, {
          locationId: post && typeof post.location_id === "string" ? post.location_id : null,
        }),
      };
    }
    case "delete_post": {
      const postId = requiredString(args, "post_id");
      return {
        post_id: postId,
        deleted: await deletePost(
          site.db,
          site.organizationId,
          site.siteId,
          postId,
        ),
        context: await mutationContextPayload(site),
      };
    }
    case "list_blog_posts":
      return {
        posts: await listPlatformBlogPosts(
          site.db,
          optionalString(args, "status") ?? undefined,
          site.siteId,
        ),
      };
    case "get_blog_post":
      return {
        post: await getPlatformBlogPost(
          site.db,
          requiredString(args, "post_id"),
          site.siteId,
        ),
      };
    case "create_blog_post": {
      const result = await createPlatformBlogPost(
        site.db,
        site.userId,
        args as never,
        { site_id: site.siteId, organization_id: site.organizationId },
      );
      return { post: result.post, context: await mutationContextPayload(site) };
    }
    case "update_blog_post": {
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        omit(args, ["post_id"]) as never,
        site.siteId,
      );
      return { post: result.post, context: await mutationContextPayload(site) };
    }
    case "set_blog_post_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const result = await updatePlatformBlogPost(
        site.db,
        requiredString(args, "post_id"),
        { featured_image_asset_id: assetId } as never,
        site.siteId,
      );
      return { post: result.post, context: await mutationContextPayload(site) };
    }
    case "delete_blog_post": {
      const postId = requiredString(args, "post_id");
      await deletePlatformBlogPost(site.db, postId, site.siteId);
      return { post_id: postId, deleted: true, context: await mutationContextPayload(site) };
    }
    case "get_site_media_assets":
      return {
        assets: await listMediaAssets(site.db, site.siteId, {
          kind: optionalString(args, "kind") ?? undefined,
          locationId: optionalString(args, "location_id") ?? undefined,
        }),
      };
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
      return {
        updated,
        context: await mutationContextPayload(site, {
          locationId: optionalString(args, "location_id"),
        }),
      };
    }
    case "delete_media_asset":
      await deleteMediaAsset(
        site.db,
        site.env,
        requiredString(args, "asset_id"),
        site.siteId,
      );
      return { deleted: true, context: await mutationContextPayload(site) };
    case "get_dashboard_link": {
      const destination = requiredString(args, "destination") as DashboardDestination;
      if (!Object.prototype.hasOwnProperty.call(DASHBOARD_DESTINATIONS, destination)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Unknown destination "${destination}". Valid destinations: ${Object.keys(DASHBOARD_DESTINATIONS).join(", ")}`,
        );
      }
      return { url: buildDashboardUrl(site, destination) };
    }
    case "get_facebook_connection": {
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection) {
        return {
          connected: false,
          connectUrl: buildDashboardUrl(site, "settings.general"),
        };
      }
      return {
        connected: true,
        facebook_page_id: connection.facebook_page_id ?? null,
        facebook_page_name: connection.facebook_page_name ?? null,
        status: connection.status,
      };
    }
    case "publish_to_facebook": {
      const allowed = await hasSiteEntitlement(
        site.db,
        site.siteId,
        "managed_service",
      );
      if (!allowed) {
        throw createError({
          statusCode: 403,
          statusMessage:
            "Facebook publishing is included in the Managed plan and above.",
        });
      }
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection)
        throw createError({
          statusCode: 404,
          statusMessage:
            "No Facebook connection found. Connect Facebook from the dashboard first.",
        });
      if (!connection.facebook_page_id || !connection.encrypted_page_token) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "No Facebook Page selected. Sync a page from the dashboard first.",
        });
      }
      const result = await publishToPage(
        connection.encrypted_page_token,
        connection.facebook_page_id,
        {
          message: requiredString(args, "message"),
          link: optionalString(args, "link") ?? undefined,
          published: args.published !== false,
        },
      );
      return {
        success: true,
        post_id: result.id,
        page_name: connection.facebook_page_name,
        context: await mutationContextPayload(site),
      };
    }
    case "sync_facebook_page": {
      const allowed = await hasSiteEntitlement(
        site.db,
        site.siteId,
        "managed_service",
      );
      if (!allowed) {
        throw createError({
          statusCode: 403,
          statusMessage:
            "Facebook sync is included in the Managed plan and above.",
        });
      }
      const connection = await getFacebookPagesConnection(
        site.env as never,
        site.organizationId,
        site.siteId,
      );
      if (!connection)
        throw createError({
          statusCode: 404,
          statusMessage:
            "No Facebook connection found. Connect Facebook from the dashboard first.",
        });

      const requestedPageId = optionalString(args, "page_id");
      let pageToken = connection.encrypted_page_token;
      let pageId = requestedPageId ?? connection.facebook_page_id;

      if (requestedPageId && requestedPageId !== connection.facebook_page_id) {
        const pages = await getFacebookPages(connection.encrypted_user_token);
        const selected = pages.find((p) => p.id === requestedPageId);
        if (!selected)
          throw createError({
            statusCode: 404,
            statusMessage: "Page not found in this connection.",
          });
        pageToken = selected.access_token;
        pageId = selected.id;
        await storeFacebookPagesConnection(site.env as never, {
          ...connection,
          facebook_page_id: selected.id,
          facebook_page_name: selected.name,
          encrypted_user_token: connection.encrypted_user_token,
          encrypted_page_token: pageToken,
          status: "active",
        });
      }

      if (!pageToken || !pageId) {
        throw createError({
          statusCode: 400,
          statusMessage:
            "No Facebook Page selected. Pass page_id or sync a page from the dashboard first.",
        });
      }

      const pageInfo = await getPageInfo(pageToken, pageId);
      const locationId = optionalString(args, "location_id");
      if (locationId) {
        await syncPageInfoToLocation(
          site.env as never,
          pageInfo,
          connection.id,
          site.organizationId,
          site.siteId,
          locationId,
        );
      }

      return {
        success: true,
        synced_to_location: !!locationId,
        page: {
          id: pageInfo.id,
          name: pageInfo.name,
          about: pageInfo.about ?? null,
          phone: pageInfo.phone ?? null,
          website: pageInfo.website ?? null,
          city: pageInfo.location?.city ?? null,
          fan_count: pageInfo.fan_count ?? null,
          cover: pageInfo.cover?.source ?? null,
          picture: pageInfo.picture?.data?.url ?? null,
        },
        context: await mutationContextPayload(site, { locationId }),
      };
    }
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
    case "get_page_fields":
      console.error(
        "[MCP] get_page_fields invoked page=%s site=%s",
        args.page,
        site.siteId,
      );
      return await getEditorContent(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "page"),
        optionalString(args, "location_id") ?? undefined,
      );
    case "update_page_content":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: requiredString(args, "page"),
            changes: objectRecord(args.changes, "changes"),
            location_id: locationId,
          },
        );
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "get_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const scopeType = (optionalString(args, "scope_type") ?? "site") as BookingPolicyScopeType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
      const locale = optionalString(args, "locale") ?? "en";
      const policy = await getDirectBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        scopeType,
        locationId,
        experienceId,
      });
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      return {
        policy,
        resolved_policy: resolvedPolicy,
        summary: renderBookingPolicySummary(resolvedPolicy, locale),
      };
    }
    case "preview_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
      const locale = optionalString(args, "locale") ?? "en";
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      const preview = applyBookingPolicyPatch(
        resolvedPolicy,
        await validateBookingPolicyPatch(args as Record<string, unknown>, policyType),
      );
      return {
        resolved_policy: preview,
        summary: renderBookingPolicySummary(preview, locale),
      };
    }
    case "update_booking_policy": {
      const policyType = requiredString(args, "policy_type") as BookingPolicyType;
      const scopeType = (optionalString(args, "scope_type") ?? "site") as BookingPolicyScopeType;
      const locationId = optionalString(args, "location_id");
      const experienceId = optionalString(args, "experience_id");
      const locale = optionalString(args, "locale") ?? "en";
      const policy = await upsertBookingPolicy(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        policyType,
        scopeType,
        locationId,
        experienceId,
        patch: await validateBookingPolicyPatch(args as Record<string, unknown>, policyType),
      });
      const resolvedPolicy = await resolveBookingPolicy(site.db, {
        siteId: site.siteId,
        policyType,
        locationId,
        experienceId,
      });
      return {
        policy,
        resolved_policy: resolvedPolicy,
        summary: renderBookingPolicySummary(resolvedPolicy, locale),
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "update_home_hero":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          title: optionalString(args, "title"),
          subtitle: optionalString(args, "subtitle"),
          image_asset_id: optionalString(args, "image_asset_id"),
          video_asset_id: optionalString(args, "video_asset_id"),
          location_id: locationId,
        });
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_hero_image":
      try {
        const assetId = requiredString(args, "asset_id");
        const locationId = optionalString(args, "location_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const currentHero = await getCurrentHomeHeroState(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
        );
        const update = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          image_asset_id: assetId,
          location_id: locationId,
        });
        const asset = await getMediaAsset(site.db, assetId, site.siteId);
        return {
          ...update,
          asset_id: assetId,
          public_url: asset?.public_url ?? null,
          ...(currentHero.hero_video_asset_id
            ? {
                warning:
                  "This page already has a hero video, which takes display priority over a hero image. The video will keep showing. Call clear_home_hero_video first if you want this image to display instead.",
              }
            : {}),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_hero_video":
      try {
        const assetId = requiredString(args, "asset_id");
        const locationId = optionalString(args, "location_id");
        await requireActiveVideoAsset(site.db, site.siteId, assetId, "asset_id");
        const currentHero = await getCurrentHomeHeroState(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
        );
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          video_asset_id: assetId,
          location_id: locationId,
        });
        return {
          ...updated,
          ...(currentHero.hero_image_asset_id
            ? {
                warning:
                  "This page already has a hero image, but the new hero video will take display priority over it.",
              }
            : {}),
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "clear_home_hero_image":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          image_asset_id: null,
          location_id: locationId,
        });
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "clear_home_hero_video":
      try {
        const locationId = optionalString(args, "location_id");
        const updated = await updateHomeHero(site.db, site.organizationId, site.siteId, {
          video_asset_id: null,
          location_id: locationId,
        });
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_about_story_image":
      try {
        const assetId = requiredString(args, "asset_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: "about",
            changes: { "story.image": assetId },
            location_id: null,
          },
        );
        return {
          ...updated,
          context: await mutationContextPayload(site),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "set_home_story_image":
      try {
        const assetId = requiredString(args, "asset_id");
        await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
        const updated = await updatePageContent(
          site.db,
          site.organizationId,
          site.siteId,
          {
            page: "home",
            changes: { "story.image": assetId },
            location_id: null,
          },
        );
        return {
          ...updated,
          context: await mutationContextPayload(site),
        };
      } catch (error) {
        return rethrowAsInvalidParams(error);
      }
    case "delete_content_field":
      {
        const locationId = optionalString(args, "location_id");
        const result = await deleteContentField(
        site.db,
        site.organizationId,
        site.siteId,
        {
          page: requiredString(args, "page"),
          field: requiredString(args, "field"),
          location_id: locationId,
        },
        );
        return {
          ...result,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    case "list_location_qa":
      return {
        items: await listLocationQa(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "create_location_qa": {
      const locationId = requiredString(args, "location_id");
      const result = await createLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        omit(args, ["location_id"]) as never,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "update_location_qa":
      {
        const locationId = requiredString(args, "location_id");
        const updated = await updateLocationQa(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
          requiredString(args, "qa_id"),
          omit(args, ["location_id", "qa_id"]),
        );
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    case "delete_location_qa": {
      const locationId = requiredString(args, "location_id");
      const result = await deleteLocationQa(
        site.db,
        site.siteId,
        locationId,
        requiredString(args, "qa_id"),
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "reorder_location_qa":
      {
        const locationId = requiredString(args, "location_id");
        const updated = await reorderLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
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
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    case "list_location_reviews":
      return {
        reviews: await listLocationReviews(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "reply_to_review": {
      const reply =
        args.reply === null ? null : requiredString(args, "reply");
      const result = await replyToReview(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "review_id"),
        reply,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site),
      };
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
    case "create_experience": {
      const ceArgs = expandSlotGeneratorArgs(args as Record<string, unknown>);
      const priceAmountRaw = ceArgs.price_amount;
      if (priceAmountRaw !== undefined && priceAmountRaw !== null && typeof priceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "price_amount must be a number or null");
      }
      let locationId = ceArgs.location_id ? String(ceArgs.location_id) : null;
      if (!locationId) {
        const siteRow = (await loadSiteSettings(site.db, site.organizationId, site.siteId)) as Record<string, unknown>;
        locationId = (siteRow.primary_location_id as string | null) ?? null;
      }
      if (!locationId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "location_id is required because this site does not have a primary location yet. Call list_locations or create_location first, then retry create_experience with that location_id.",
        );
      }
      const experience = await createExperience(
          site.db,
          site.organizationId,
          site.siteId,
          {
            ...(ceArgs as unknown as CreateExperienceInput),
            location_id: locationId,
            price_amount: typeof priceAmountRaw === "number" ? priceAmountRaw : null,
          },
          site.userId,
        );
      return {
        experience,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "update_experience": {
      const ueArgs = expandSlotGeneratorArgs(omit(args, ["experience_id"]) as Record<string, unknown>);
      const priceAmountRaw = ueArgs.price_amount;
      if (priceAmountRaw !== undefined && priceAmountRaw !== null && typeof priceAmountRaw !== "number") {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "price_amount must be a number or null");
      }
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            ...(ueArgs as unknown as UpdateExperienceInput),
            ...(priceAmountRaw !== undefined
              ? { price_amount: typeof priceAmountRaw === "number" ? priceAmountRaw : null }
              : {}),
          },
        );
      return {
        experience,
        context: await mutationContextPayload(site, {
          locationId:
            experience && typeof experience.location_id === "string"
              ? experience.location_id
              : null,
        }),
      };
    }
    case "set_experience_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { image_asset_id: assetId },
        );
      return {
        experience,
        context: await mutationContextPayload(site, {
          locationId:
            experience && typeof experience.location_id === "string"
              ? experience.location_id
              : null,
        }),
      };
    }
    case "set_experience_video": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveVideoAsset(site.db, site.siteId, assetId, "asset_id");
      const experience = await updateExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { video_asset_id: assetId },
        );
      return {
        experience,
        context: await mutationContextPayload(site, {
          locationId: experience && typeof experience.location_id === "string" ? experience.location_id : null,
        }),
      };
    }
    case "reorder_experience_gallery": {
      const experienceId = requiredString(args, "experience_id");
      const current = await getExperienceById(site.db, site.siteId, experienceId);
      if (!current) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `No experience found with id "${experienceId}".`);
      }
      const raw = objectArray(args.images, "images");
      const images = raw.map((img) => {
        if (typeof img.url !== "string" || !img.url) {
          throw mcpProtocolError(MCP_ERROR.invalidParams, "Each gallery item must have a non-empty url string");
        }
        if (img.kind !== "image" && img.kind !== "video") {
          throw mcpProtocolError(MCP_ERROR.invalidParams, 'Each gallery item must have kind "image" or "video"');
        }
        return { url: img.url, kind: img.kind as "image" | "video" };
      });
      const key = (item: { url: string; kind: string }) => `${item.kind}:${item.url}`;
      const currentKeys = (current.images ?? []).map(key).sort();
      const nextKeys = images.map(key).sort();
      const isSamePermutation =
        currentKeys.length === nextKeys.length && currentKeys.every((k, i) => k === nextKeys[i]);
      if (!isSamePermutation) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "images must be a reordering of the experience's existing gallery (same url/kind values, new order). To add or remove gallery items, use update_experience instead.",
        );
      }
      const experience = await updateExperience(site.db, site.siteId, experienceId, { images });
      return {
        experience,
        context: await mutationContextPayload(site, {
          locationId: experience && typeof experience.location_id === "string" ? experience.location_id : null,
        }),
      };
    }
    case "delete_experience":
      return {
        deleted: await deleteExperience(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { locationId: optionalString(args, "location_id") ?? null },
        ),
        context: await mutationContextPayload(site),
      };
    case "list_experience_bookings":
      return {
        bookings: await listExperienceBookings(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          { locationId: optionalString(args, "location_id") ?? null },
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
        context: await mutationContextPayload(site),
      };
    case "get_experience_availability": {
      const experienceId = requiredString(args, "experience_id");
      const experience = await getExperienceById(site.db, site.siteId, experienceId);
      if (!experience) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Experience not found.");
      }
      const startDate = requiredString(args, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Date must be YYYY-MM-DD format");
      }
      const parsedDate = new Date(`${startDate}T00:00:00Z`);
      if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== startDate) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid calendar date");
      }
      const daysRaw = (args as Record<string, unknown>).days;
      if (daysRaw !== undefined && typeof daysRaw === "number" && !Number.isInteger(daysRaw)) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "days must be an integer");
      }
      const days = Math.min(Math.max(typeof daysRaw === "number" ? daysRaw : 1, 1), 31);
      const cursor = new Date(`${startDate}T00:00:00Z`);
      const dates: Array<{ date: string; slots: Awaited<ReturnType<typeof getSlotAvailability>> }> = [];
      for (let i = 0; i < days; i++) {
        const dateStr = cursor.toISOString().slice(0, 10);
        dates.push({ date: dateStr, slots: await getSlotAvailability(site.db, site.siteId, experience, dateStr) });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return { dates };
    }
    case "set_experience_slot_override":
      return {
        override: await upsertSlotOverride(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            override_date: requiredString(args, "date"),
            time_slot: requiredString(args, "time_slot"),
            status: requiredString(args, "status") as "closed" | "open",
            capacity_override: typeof (args as Record<string, unknown>).capacity_override === "number"
              ? ((args as Record<string, unknown>).capacity_override as number)
              : null,
            note: optionalString(args, "note") ?? null,
          },
          site.userId,
        ),
      };
    case "list_experience_slot_overrides":
      return {
        overrides: await listSlotOverrides(
          site.db,
          site.siteId,
          requiredString(args, "experience_id"),
          {
            fromDate: optionalString(args, "from") ?? undefined,
            toDate: optionalString(args, "to") ?? undefined,
          },
        ),
      };
    case "list_locales":
      return await listSiteLocales(site.db, site.organizationId, site.siteId);
    case "upsert_locale":
      {
        const locale = await upsertSiteLocale(
          site.db,
          site.organizationId,
          site.siteId,
          args as never,
        );
        return { locale, context: await mutationContextPayload(site) };
      }
    case "delete_locale":
      {
        const result = await deleteSiteLocale(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
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
      return { job, first_batch: result, context: await mutationContextPayload(site) };
    }
    case "list_translation_jobs": {
      const jobs = await queryAll(
        site.db,
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
        [site.organizationId, site.siteId],
      );
      return { jobs };
    }
    case "get_translation_job": {
      const jobId = requiredString(args, "job_id");
      const job = await queryFirst(
        site.db,
        `
        SELECT *
        FROM translation_jobs
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `,
        [jobId, site.organizationId, site.siteId],
      );
      if (!job) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Translation job not found: ${jobId}`,
        );
      }
      const items = await queryAll(
        site.db,
        `
        SELECT id, entity_type, entity_id, location_id, page, field, source_hash, source_chars, status, error, created_at, updated_at
        FROM translation_job_items
        WHERE job_id = ? AND organization_id = ? AND site_id = ?
        ORDER BY entity_type, page, field
        LIMIT 500
      `,
        [jobId, site.organizationId, site.siteId],
      );
      return { job, items };
    }
    case "run_translation_job_batch":
      {
        const result = await processTranslationJobBatch(
        site.db,
        site.env,
        site.organizationId,
        site.siteId,
        requiredString(args, "job_id"),
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
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
      {
        const result = await saveTranslationReviewItem(
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
        return { ...result, context: await mutationContextPayload(site) };
      }
    case "publish_translations":
      {
        const result = await publishTranslationDrafts(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "locale"),
        parseScope(optionalString(args, "scope") ?? undefined),
        site.userId,
        );
        return { ...result, context: await mutationContextPayload(site) };
      }
    case "get_contact_inquiries":
      return {
        submissions: await listContactSubmissions(site.db, site.siteId),
      };
    case "get_reservation_inquiries":
      return {
        submissions: await listReservationSubmissions(site.db, site.siteId, {
          locationId: optionalString(args, "location_id") ?? null,
        }),
      };
    case "get_notification_settings":
      return {
        notifications: await getNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
        ),
      };
    case "update_notification_settings":
      {
        const rawPhone = args.whatsapp_phone;
        const whatsappPhone = typeof rawPhone === "string" && rawPhone.trim()
          ? rawPhone.trim()
          : undefined;
        const channels = args.channels === undefined
          ? undefined
          : requiredStringArray(args.channels, "channels");

        if (!whatsappPhone && !channels) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            "Provide whatsapp_phone and/or channels.",
          );
        }

        const notifications = await updateNotificationsSettings(
          site.db,
          site.organizationId,
          site.siteId,
          whatsappPhone,
          channels,
        );
        return {
          notifications,
          context: await mutationContextPayload(site),
        };
      }
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
      return {
        ...result.data,
        context: await mutationContextPayload(site),
      };
    }
    case "save_generated_image": {
      if (!hasCloudflareImagesConfig(site.env))
        throw new Error("Cloudflare Images not configured");
      const imageData = requiredString(args, "image_data_base64");
      const prompt = optionalString(args, "prompt") ?? null;
      let upload: Awaited<ReturnType<typeof resolveGeneratedImageUpload>>;
      try {
        upload = await resolveGeneratedImageUpload(imageData);
      } catch (err) {
        console.error("[MCP] save_generated_image base64 decode error:", err);
        throw err;
      }
      const detectedContentType = validateImageBuffer(
        new Uint8Array(upload.buffer),
        "base64 input",
      );
      console.error("[MCP] save_generated_image uploading bytes=%d contentType=%s", upload.buffer.byteLength, upload.contentType);

      const uploaded = await uploadImageBuffer(
        site.env as Parameters<typeof uploadImageBuffer>[0],
        upload.buffer,
        upload.filename,
        detectedContentType,
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
        uploaded: true,
        assigned: false,
        assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        nextStep:
          "Upload complete. This image is in the media library but not assigned yet. Call a placement tool like set_home_hero_image or set_logo next.",
        context: await mutationContextPayload(site),
      };
    }
    case "save_generated_image_file": {
      if (!hasCloudflareImagesConfig(site.env))
        throw new Error("Cloudflare Images not configured");
      const attachment = toolFileReference(args.attachment_id, "attachment_id");
      const prompt = optionalString(args, "prompt") ?? null;
      const upload = await resolveGeneratedImageFile(attachment);
      const uploaded = await uploadImageBuffer(
        site.env as Parameters<typeof uploadImageBuffer>[0],
        upload.buffer,
        upload.filename,
        upload.contentType,
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
        alt_text:
          prompt ?? attachment.file_name ?? "AI-generated image attachment",
        mime_type: upload.contentType,
        file_name: upload.filename,
        status: "active",
        created_by_user_id: site.userId,
      });

      return {
        assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        context: await mutationContextPayload(site),
      };
    }
    case "upload_user_photo": {
      if (!hasCloudflareImagesConfig(site.env))
        throw new Error("Cloudflare Images not configured");
      const description = optionalString(args, "description") ?? null;
      const category = optionalString(args, "category") ?? null;
      const fileReferenceValue = args.file;
      const fileReference =
        fileReferenceValue !== undefined
          ? toolFileReference(fileReferenceValue, "file")
          : null;
      const fileId = optionalString(args, "file_id") ?? null;

      if (!fileReference && !fileId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "upload_user_photo requires either file or file_id.",
        );
      }

      const upload = fileReference
        ? await resolveGeneratedImageFile(fileReference)
        : await resolveUserUploadedImageFile(fileId!, site.env);
      const uploaded = await uploadImageBuffer(
        site.env as Parameters<typeof uploadImageBuffer>[0],
        upload.buffer,
        upload.filename,
        upload.contentType,
      );

      const assetId = crypto.randomUUID();
      await createMediaAsset(site.db, {
        id: assetId,
        organization_id: site.organizationId,
        site_id: site.siteId,
        kind: "image",
        provider: "cloudflare_images",
        source: "uploaded",
        cloudflare_image_id: uploaded.imageId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        alt_text: description ?? fileReference?.file_name ?? fileId,
        mime_type: upload.contentType,
        file_name: upload.filename,
        category: (category as never) ?? null,
        status: "active",
        created_by_user_id: site.userId,
      });

      return {
        assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        context: await mutationContextPayload(site),
      };
    }
    // ─── Domain management ──────────────────────────────────────────────────
    case "get_site_domains": {
      const domains = await getSiteDomains(site.db, site.siteId);
      return {
        domains: domains.map((d) => ({
          id: d.id,
          domain: d.domain,
          type: d.type,
          role: d.role,
          status: d.status,
          instructions: domainInstructions(d),
        })),
      };
    }
    case "create_domain": {
      const hasEntitlement = await hasCustomDomainsEntitlement(
        site.db,
        site.siteId,
      );
      if (!hasEntitlement) {
        throw createError({
          statusCode: 403,
          statusMessage: "Custom domains require the Growth plan or higher.",
        });
      }
      const domain = requiredString(args, "domain");
      const includeWww = args.include_www !== false;
      const validation = validateCustomDomain(
        site.env as Parameters<typeof validateCustomDomain>[0],
        domain,
      );
      if (!validation.valid) {
        throw createError({
          statusCode: 400,
          statusMessage: validation.reason ?? "Invalid domain",
        });
      }
      const records = await createCustomDomainPair(
        site.env as Parameters<typeof createCustomDomainPair>[0],
        site.db,
        {
          siteId: site.siteId,
          organizationId: site.organizationId,
          domain,
          includeWww,
          actorId: site.userId,
          actorType: "owner",
        },
      );
      return {
        domains: records.map((d) => ({
          id: d.id,
          domain: d.domain,
          role: d.role,
          status: d.status,
          instructions: domainInstructions(d),
        })),
        context: await mutationContextPayload(site),
      };
    }
    case "set_canonical_domain": {
      const domainId = requiredString(args, "domain_id");
      const record = await setCanonicalDomain(
        site.db,
        site.siteId,
        domainId,
        "owner",
        site.userId,
      );
      return {
        id: record.id,
        domain: record.domain,
        role: record.role,
        status: record.status,
        context: await mutationContextPayload(site),
      };
    }
    case "delete_domain": {
      const domainId = requiredString(args, "domain_id");
      await deleteCustomDomain(
        site.env as Parameters<typeof deleteCustomDomain>[0],
        site.db,
        domainId,
        "owner",
        site.userId,
      );
      return { deleted: true, domain_id: domainId, context: await mutationContextPayload(site) };
    }
    case "sync_domain": {
      const domainId = requiredString(args, "domain_id");
      const record = await syncDomainWithCloudflare(
        site.env as Parameters<typeof syncDomainWithCloudflare>[0],
        site.db,
        domainId,
        "owner",
        site.userId,
      );
      return {
        id: record.id,
        domain: record.domain,
        status: record.status,
        ssl_status: record.cloudflare_ssl_status ?? null,
        dns_status: record.dns_status ?? null,
        instructions: domainInstructions(record),
        context: await mutationContextPayload(site),
      };
    }
    // ─── Analytics ──────────────────────────────────────────────────────────
    case "get_site_analytics": {
      const startDate =
        optionalString(args, "start_date") ??
        getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endDate =
        optionalString(args, "end_date") ?? getDateString(new Date());
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ) {
        throw createError({
          statusCode: 400,
          statusMessage: "Dates must be YYYY-MM-DD format",
        });
      }
      await aggregateAnalyticsForRange(site.db, site.siteId, startDate, endDate);
      const rows = await queryAll<Record<string, unknown>>(
        site.db,
        `
        SELECT date, page_views, unique_sessions, COALESCE(avg_session_duration, 0) as avg_session_duration, top_pages
        FROM site_analytics_daily
        WHERE site_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
      `,
        [site.siteId, startDate, endDate],
      );
      const toNum = (v: unknown) =>
        typeof v === "number" ? v : Number(v || 0);
      const summary = rows.reduce<{
        pageViews: number;
        sessions: number;
        totalDuration: number;
      }>(
        (acc, row) => ({
          pageViews: acc.pageViews + toNum(row.page_views),
          sessions: acc.sessions + toNum(row.unique_sessions),
          totalDuration:
            acc.totalDuration +
            toNum(row.avg_session_duration) * toNum(row.unique_sessions),
        }),
        { pageViews: 0, sessions: 0, totalDuration: 0 },
      );
      const avgSessionDuration =
        summary.sessions > 0
          ? Math.round(summary.totalDuration / summary.sessions)
          : 0;
      const topPageMap = new Map<string, number>();
      for (const row of rows) {
        if (!row.top_pages) continue;
        try {
          const parsed = JSON.parse(String(row.top_pages));
          if (!Array.isArray(parsed)) continue;
          for (const page of parsed as Record<string, unknown>[]) {
            const path =
              String(page.path ?? page.pagePath ?? "/").trim() || "/";
            const views = toNum(page.views ?? page.count);
            if (views > 0)
              topPageMap.set(path, (topPageMap.get(path) ?? 0) + views);
          }
        } catch {
          /* skip malformed rows */
        }
      }
      const topPages = Array.from(topPageMap.entries())
        .map(([path, views]) => ({
          path,
          views,
          percentOfTotal:
            summary.pageViews > 0
              ? Math.round((views / summary.pageViews) * 100)
              : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);
      return {
        metrics: {
          pageViews: summary.pageViews,
          uniqueSessions: summary.sessions,
          avgSessionDuration,
        },
        topPages,
        period: { startDate, endDate },
      };
    }
    default:
      throw mcpProtocolError(
        MCP_ERROR.methodNotFound,
        `Unhandled tool: ${toolName}`,
      );
  }
}

async function getCurrentHomeHeroState(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId?: string | null,
) {
  const content = await getPageContent(
    db,
    organizationId,
    siteId,
    "home",
    locationId ?? undefined,
  );
  const hero = content.find((entry) => entry.field === "hero");
  return {
    hero_image_asset_id: hero?.hero_image_asset_id ?? null,
    hero_video_asset_id: hero?.hero_video_asset_id ?? null,
  };
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
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};
  for (const key of required) {
    const propertySchema =
      properties[key] && typeof properties[key] === "object"
        ? (properties[key] as Record<string, unknown>)
        : null;
    const allowsNull = propertyAllowsNull(propertySchema);
    if (
      !(key in args) ||
      args[key] === undefined ||
      (args[key] === null && !allowsNull) ||
      args[key] === ""
    ) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        `Missing required argument: ${key}`,
      );
    }
  }
}

function propertyAllowsNull(schema: Record<string, unknown> | null) {
  if (!schema) return false;
  const type = schema.type;
  if (type === "null") return true;
  if (Array.isArray(type)) return type.includes("null");
  return false;
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
  return value as Record<string, unknown>;
}

function rethrowAsInvalidParams(error: unknown): never {
  if (!(error instanceof Error)) throw error;
  const message = error.message;
  if (
    message.startsWith('Field "') ||
    message.includes("must be a string") ||
    message.includes("must be an object with hero_title/hero_subtitle")
  ) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, message);
  }
  throw error;
}

function objectArray(value: unknown, key: string) {
  if (!Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  if (
    value.some(
      (el) => el === null || typeof el !== "object" || Array.isArray(el),
    )
  ) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Invalid ${key}: each element must be an object`,
    );
  }
  return value as Record<string, unknown>[];
}

function omit(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keys.includes(key)),
  );
}

function normalizeMenuItemArgs(
  args: Record<string, unknown>,
  { requireSection }: { requireSection: boolean },
) {
  const normalized = { ...args };

  if (
    normalized.price_amount === undefined &&
    normalized.price !== undefined &&
    normalized.price !== null &&
    normalized.price !== ""
  ) {
    normalized.price_amount = normalized.price;
  }

  if (requireSection) {
    normalized.section = requiredString(normalized, "section");
  } else if (
    normalized.section !== undefined &&
    typeof normalized.section !== "string"
  ) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid section");
  }

  return normalized;
}

function menuItemLookupKey(name: string) {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return key || name.trim().toLowerCase();
}

function toolString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /UNIQUE constraint failed/i.test(message);
}

function getDateString(date: Date): string {
  const [day] = date.toISOString().split("T");
  return day ?? "";
}

function normalizeBase64Payload(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
}

function detectImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50) {
    return "image/webp";
  }
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header === "GIF87a" || header === "GIF89a") {
      return "image/gif";
    }
  }
  return null;
}

function extensionForContentType(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
}

function normalizeChannelsInput(
  args: Record<string, unknown>,
): Array<"site" | "gmb" | "instagram" | "facebook"> {
  const rawChannels = args.channels;
  const rawTargets = args.targets;

  if (rawChannels !== undefined && rawTargets !== undefined) {
    const normalizedChannels = normalizeChannelArray(rawChannels);
    const normalizedTargets = normalizeChannelArray(rawTargets);
    const channelSignature = [...normalizedChannels].sort().join(",");
    const targetSignature = [...normalizedTargets].sort().join(",");
    if (channelSignature !== targetSignature) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "Provide either channels or targets, not conflicting values for both.",
      );
    }
    return normalizedChannels;
  }

  if (rawChannels !== undefined) return normalizeChannelArray(rawChannels);
  if (rawTargets !== undefined) return normalizeChannelArray(rawTargets);
  return ["site"];
}

function normalizeChannelArray(
  value: unknown,
): Array<"site" | "gmb" | "instagram" | "facebook"> {
  if (!Array.isArray(value) || !value.length) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "channels must be a non-empty array when provided.",
    );
  }

  const normalized = value.filter(
    (item): item is "site" | "gmb" | "instagram" | "facebook" =>
      item === "site" ||
      item === "gmb" ||
      item === "instagram" ||
      item === "facebook",
  );

  if (normalized.length !== value.length) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "channels may only contain site, facebook, instagram, or gmb.",
    );
  }

  return [...new Set(normalized)];
}

async function loadSiteSettings(
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  const site = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT s.id, s.organization_id, s.subdomain, s.theme, s.status,
           s.primary_location_id, s.public_url, s.custom_domain_status, s.default_currency,
           s.brand_name, s.brand_description, s.logo_url, s.logo_asset_id, s.contact_email,
           s.settings, s.last_published_at, s.created_at, s.updated_at
    FROM sites s
    WHERE s.id = ? AND s.organization_id = ?
    LIMIT 1
  `,
    [siteId, organizationId],
  );

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
  const siteId =
    typeof data.siteId === "string"
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
