// AUTO-SPLIT from the former monolithic mcp-executor.ts. Shared helpers and
// the per-tool-call context type used across domain-scoped tool-call
// handlers. Each domain file imports its own domain-specific dependencies
// directly rather than through this module.
import { createError, type H3Event } from "h3";
import { queryFirst } from "~/server/db";
import { assertSafeDownloadUrl } from "~/server/utils/platform-mcp-executor";
import { getPageContent } from "~/server/utils/content-management";
import { getMediaAsset } from "~/server/utils/media-asset-manager";
import { generateSlots, type WeekdayName } from "~/server/utils/experiences";
import type { getMcpTool } from "~/server/utils/mcp-tools";
import { requireMcpUser, type requireMcpSite, type McpUserContext } from "~/server/utils/mcp-auth";
import { mcpProtocolError, MCP_ERROR } from "~/server/utils/mcp-protocol";
import {
  resolveMcpWorkspace,
  type McpLocationSummary,
  type McpSiteSummary,
} from "~/server/utils/mcp-context";
import { chargeFlatCredits, type FlatCreditAction } from "~/server/utils/ai-credits";

// Prefers the user's active organization (session-based auth only — see
// McpUserContext.activeOrganizationId) and falls back to the oldest
// membership, matching the REST places endpoints. Never throws: billing
// failures must not surface as a Google Places tool failure.
export async function chargeFlatCreditsForUser(
  user: McpUserContext,
  action: FlatCreditAction,
): Promise<void> {
  const activeOrgId = user.activeOrganizationId ?? "";
  const orgRow = await queryFirst<{ organizationId: string }>(user.db, `
    SELECT o.id AS organizationId FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY CASE WHEN o.id = ? THEN 0 ELSE 1 END, o.createdAt ASC LIMIT 1
  `, [user.userId, activeOrgId]).catch((error) => {
    console.error(`chargeFlatCreditsForUser org lookup failed for ${action}:`, error, { userId: user.userId });
    return null;
  });
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

export function haversineKm(
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

export async function resolveGeneratedImageUpload(
  imageData: string,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const normalizedData = normalizeBase64Payload(imageData);
  const dataUrlMatch = imageData.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );
  if (dataUrlMatch) {
    const base64 = normalizeBase64Payload(dataUrlMatch[2] || "");
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } catch {
      throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid base64 image data in data URL.");
    }
    const contentType = validateImageBuffer(bytes, "base64 data URL input");
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

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(normalizedData), (c) => c.charCodeAt(0));
  } catch {
    throw mcpProtocolError(MCP_ERROR.invalidParams, "Invalid base64 image data.");
  }
  const contentType = validateImageBuffer(bytes, "base64 input");
  const extension = extensionForContentType(contentType);
  return {
    buffer: bytes.buffer as ArrayBuffer,
    contentType,
    filename: `ai-generated-${Date.now()}.${extension}`,
  };
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

export function validateImageBuffer(
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

export async function requireActiveImageAsset(
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
export function expandSlotGeneratorArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { slot_start, slot_end, slot_interval_minutes, slot_weekday, ...rest } = args;
  if (slot_start === undefined && slot_end === undefined && slot_interval_minutes === undefined) {
    if (slot_weekday !== undefined) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "slot_weekday requires slot_start, slot_end, and slot_interval_minutes to also be provided.",
      );
    }
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

export type GeneratedImageTarget =
  | "logo"
  | "home_hero"
  | "about_story_image"
  | "home_story_image"
  | "location_hero"
  | "post_image"
  | "menu_item_image"
  | "experience_image";

export interface GeneratedImagePickerConfig {
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

export function assignmentForGeneratedTarget(
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

export function pickerConfigFromShowGeneratedImages(
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

export async function requireActiveVideoAsset(
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

export interface ToolFileReference {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

export function toolFileReference(value: unknown, key: string): ToolFileReference {
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

export async function resolveUserUploadedImageFile(
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

export async function resolveGeneratedImageFile(
  file: ToolFileReference,
): Promise<{ buffer: ArrayBuffer; contentType: string; filename: string }> {
  const safeDownloadUrl = assertSafeDownloadUrl(file.download_url, `Attachment ${file.file_id}`);
  const response = await fetch(safeDownloadUrl, {
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

export interface GoogleMapsSignals {
  nameHint: string | null;
  lat: number | null;
  lng: number | null;
  rawId: string | null;
  isHexCid: boolean;
  isChijId: boolean;
  hasStrongSignals: boolean;
}

export function extractGoogleMapsSignals(resolvedUrl: string): GoogleMapsSignals {
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

export interface ParsedHint {
  name_hint?: string;
  lat?: number;
  lng?: number;
  feature_id?: string;
  internal_id?: string;
  expected_country?: string;
  expected_region?: string;
}

export interface MatchingPolicy {
  allow_name_only_fallback: boolean;
  require_coordinate_match: boolean;
  max_distance_km: number;
  prefer_backend_extraction: boolean;
}

export const DEFAULT_MATCHING_POLICY: MatchingPolicy = {
  allow_name_only_fallback: false,
  require_coordinate_match: true,
  max_distance_km: 5,
  prefer_backend_extraction: true,
};

export function resolveMatchingPolicy(raw: unknown): MatchingPolicy {
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

export function workspaceContextPayload(
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

export function workspaceOrganizationsPayload(
  workspace: Awaited<ReturnType<typeof resolveMcpWorkspace>>,
) {
  return workspace.organizations.map((organization) => ({
    ...organization,
    active: organization.id === workspace.organization?.id,
  }));
}

export function workspaceSitesPayload(
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

export function workspaceLocationsPayload(
  workspace: Awaited<ReturnType<typeof resolveMcpWorkspace>>,
) {
  return workspace.locations.map((location) => ({
    ...location,
    active: location.id === workspace.location?.id,
  }));
}

export async function mutationContextPayload(
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

export async function resolveMenuLocationId(
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

export function toolRequiresArgument(
  schema: Record<string, unknown>,
  key: string,
) {
  return Array.isArray(schema.required) && schema.required.includes(key);
}

export function rethrowWorkspaceError(error: unknown): never {
  if (error instanceof Error && error.message) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, error.message);
  }
  throw error;
}

export async function normalizeWorkspaceArguments(
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




export async function getCurrentHomeHeroState(
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

export function humanizeEntitlement(entitlement: string) {
  return entitlement
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function validateRequiredArguments(
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

export function propertyAllowsNull(schema: Record<string, unknown> | null) {
  if (!schema) return false;
  const type = schema.type;
  if (type === "null") return true;
  if (Array.isArray(type)) return type.includes("null");
  return false;
}

export function isAllowedGoogleMapsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "maps.app.goo.gl" ||
    h === "maps.google.com" ||
    h === "google.com" ||
    h.endsWith(".google.com")
  );
}

export function requiredString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value.trim();
}

export function optionalString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function optionalDaysWindow(source: Record<string, unknown>, key: string, max = 90) {
  const value = source[key];
  if (value === undefined || value === null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${key} must be a positive number of days`);
  }
  return Math.max(1, Math.min(Math.floor(num), max));
}

export function requiredStringArray(value: unknown, key: string) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value.map((item) => item.trim());
}

export function objectRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Invalid ${key}`);
  }
  return value as Record<string, unknown>;
}

export function rethrowAsInvalidParams(error: unknown): never {
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

export function objectArray(value: unknown, key: string) {
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

export function omit(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !keys.includes(key)),
  );
}

export function normalizeMenuItemArgs(
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

export function menuItemLookupKey(name: string) {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return key || name.trim().toLowerCase();
}

export function toolString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /UNIQUE constraint failed/i.test(message);
}

export function getDateString(date: Date): string {
  const [day] = date.toISOString().split("T");
  return day ?? "";
}

export function normalizeBase64Payload(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
}

export function detectImageContentType(bytes: Uint8Array): string | null {
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

export function extensionForContentType(contentType: string) {
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

export function normalizeChannelsInput(
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

export function normalizeChannelArray(
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

export async function loadSiteSettings(
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

export function safeParseObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function assertDomainSuccess(result: {
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

export function normalizeSiteCreationData(data: Record<string, unknown>) {
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


export const NOT_HANDLED = Symbol('mcp-executor-not-handled')

export interface McpExecutorContext {
  event: H3Event
  toolName: string
  rawArguments: Record<string, unknown>
  normalizedArguments: Record<string, unknown>
  tool: ReturnType<typeof getMcpTool>
  siteId: string
  site: Awaited<ReturnType<typeof requireMcpSite>>
  args: Record<string, unknown>
}
