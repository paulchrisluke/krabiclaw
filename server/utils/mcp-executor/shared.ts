import { createError, type H3Event } from "h3";
import { queryFirst } from "~/server/db";
import { assertSafeDownloadUrl } from "~/server/utils/platform-mcp-executor";
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
import { sniffMediaMimeType, VIDEO_MIME_TYPES, MAX_VIDEO_BYTES, R2_IMAGE_MIME_TYPES } from "~/server/utils/media-mime";
import { assertMarkdownSize, decodeMarkdownText, resolveMarkdownMimeType } from "~/server/utils/markdown-document";
import { hasCloudflareImagesConfig } from "~/server/utils/cloudflare-images";

/**
 * Resolves the upload provider for an image based on content type and Cloudflare Images config.
 * Returns "cloudflare_r2" for R2-compatible formats (e.g., AVIF), otherwise undefined (requires Cloudflare Images).
 * Throws if Cloudflare Images is required but not configured.
 */
export function resolveImageUploadProvider(contentType: string, env: ApiRecord): "cloudflare_r2" | "cloudflare_images" | undefined {
  const provider = R2_IMAGE_MIME_TYPES.has(contentType) ? "cloudflare_r2" : undefined;
  if (!provider && !hasCloudflareImagesConfig(env)) {
    throw new Error("Cloudflare Images not configured");
  }
  return provider as "cloudflare_r2" | "cloudflare_images" | undefined;
}

// Prefers the user's active organization (session-based auth only — see
// McpUserContext.activeOrganizationId) and falls back to the oldest
// membership, matching the REST places endpoints. A user without a
// membership is intentionally a no-op; membership/accounting query failures
// propagate so a provider call cannot be reported as an unqualified success.
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
  `, [user.userId, activeOrgId]);
  if (!orgRow) return;

  const result = await chargeFlatCredits(user.db, orgRow.organizationId, { action });
  if (!result.charged) {
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
  | "menu_item_media"
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
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "site_logo", asset_ids: [] },
        title: "Logo Concepts",
        subtitle: "Choose the mark that feels most like the brand.",
        useLabel: `Use as logo${forSite}`,
        successMessage: `Logo updated${forSite}.`,
      };
    case "home_hero":
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "home_hero", asset_ids: [] },
        title: "Homepage Hero Images",
        subtitle: "Choose the image that best sets the tone for the homepage.",
        useLabel: `Use as homepage hero${forSite}`,
        successMessage: `Homepage hero image updated${forSite}.`,
      };
    case "about_story_image":
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "about_story_image", asset_ids: [] },
        title: "Story Images",
        subtitle: "Choose the image that best tells the brand story on the About page.",
        useLabel: `Use as About story image${forSite}`,
        successMessage: `About page story image updated${forSite}.`,
      };
    case "home_story_image":
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "home_story_image", asset_ids: [] },
        title: "Story Images",
        subtitle: "Choose the image that best tells the brand story on the homepage.",
        useLabel: `Use as homepage story image${forSite}`,
        successMessage: `Homepage story image updated${forSite}.`,
      };
    case "location_hero": {
      const locationId = requiredString(args, "location_id");
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "location_hero", location_id: locationId, asset_ids: [] },
        title: "Location Hero Images",
        subtitle: "Choose the image that best represents this location.",
        useLabel: `Use as location hero${forSite}`,
        successMessage: `Location hero image updated${forSite}.`,
      };
    }
    case "post_image": {
      const postId = requiredString(args, "post_id");
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "post_image", post_id: postId, asset_ids: [] },
        title: "Post Images",
        subtitle: "Choose the image that best fits this post.",
        useLabel: `Use for this post${forSite}`,
        successMessage: `Post image updated${forSite}.`,
      };
    }
    case "menu_item_media": {
      const menuItemId = requiredString(args, "menu_item_id");
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "menu_item_media", menu_item_id: menuItemId, asset_ids: [] },
        title: "Menu Item Media",
        subtitle: "Choose the media that best sells this item.",
        useLabel: `Use for this menu item${forSite}`,
        successMessage: `Menu item media updated${forSite}.`,
      };
    }
    case "experience_image": {
      const experienceId = requiredString(args, "experience_id");
      return {
        assignTool: "set_media",
        assignArgs: { site_id: siteId, target_type: "experience_media", experience_id: experienceId, asset_ids: [] },
        title: "Experience Media",
        subtitle: "Choose the media that best captures the experience.",
        useLabel: `Use for this experience${forSite}`,
        successMessage: `Experience media updated${forSite}.`,
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
    "post_image", "menu_item_media", "experience_image",
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

function filenameExtension(contentType: string, fallback = "bin"): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/x-msvideo":
      return "avi";
    case "text/markdown":
      return "md";
    default:
      return fallback;
  }
}

function safeAttachmentFilename(file: Pick<ToolFileReference, "file_id" | "file_name">, contentType: string): string {
  const fallbackBase = file.file_id
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "attachment";
  const rawName = file.file_name?.trim() || "";
  const candidate = rawName && !rawName.includes("/") && !rawName.includes("\\") && !rawName.includes("..")
    ? rawName
    : `${fallbackBase}.${filenameExtension(contentType)}`;
  return candidate.replace(/[^a-zA-Z0-9._ -]+/g, "-").slice(0, 160);
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

async function fetchToolFile(file: ToolFileReference, timeoutMs: number): Promise<Response> {
  const safeDownloadUrl = assertSafeDownloadUrl(file.download_url, `Attachment ${file.file_id}`);
  try {
    return await fetch(safeDownloadUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown network error";
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Failed to download attachment ${file.file_id}: ${reason}`,
    );
  }
}

export async function resolveGeneratedImageFile(
  file: ToolFileReference,
): Promise<{ buffer: Uint8Array<ArrayBuffer>; contentType: string; filename: string }> {
  const response = await fetchToolFile(file, 15_000);
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

  const buffer = await readMediaBufferWithLimit(
    response,
    `Attachment ${file.file_id}`,
    MAX_IMAGE_BYTES,
  );
  const bytes = buffer;
  const detectedContentType = validateImageBuffer(
    bytes,
    `attachment ${file.file_id}`,
  );
  const filename = safeAttachmentFilename(file, detectedContentType);
  return { buffer, contentType: detectedContentType, filename };
}

export interface ResolvedMediaFile {
  buffer: Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
  kind: "image" | "video" | "file";
}

const RESOLVED_MEDIA_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"]);

async function readMediaBufferWithLimit(
  response: Response,
  label: string,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null
    ? null
    : /^\d+$/.test(contentLength) ? Number(contentLength) : Number.NaN;
  if (declaredLength !== null && !Number.isSafeInteger(declaredLength)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} has an invalid content-length header.`);
  }
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${maxBytes} byte limit.`);
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${maxBytes} byte limit.`);
    }
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const resizable = declaredLength === null;
  const initialCapacity = resizable ? Math.min(64 * 1024, maxBytes) : declaredLength;
  const buffer = resizable
    ? new ArrayBuffer(initialCapacity, { maxByteLength: maxBytes })
    : new ArrayBuffer(initialCapacity);
  let bytes = new Uint8Array(buffer);
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeds the ${maxBytes} byte limit.`);
      }
      const requiredCapacity = total + value.byteLength;
      if (!resizable && requiredCapacity > buffer.byteLength) {
        await reader.cancel();
        throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} exceeded its content-length header.`);
      }
      if (resizable && requiredCapacity > buffer.byteLength) {
        buffer.resize(Math.min(maxBytes, Math.max(requiredCapacity, buffer.byteLength * 2)));
        bytes = new Uint8Array(buffer);
      }
      bytes.set(value, total);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  if (declaredLength !== null && total !== declaredLength) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `${label} length did not match its content-length header.`);
  }
  if (resizable && buffer.byteLength !== total) buffer.resize(total);
  return new Uint8Array(buffer);
}

/** Resolve a ChatGPT file reference and verify its type from its bytes. */
export async function resolveUserUploadedMediaFile(
  file: ToolFileReference,
  maxBytes = MAX_VIDEO_BYTES,
): Promise<ResolvedMediaFile> {
  const response = await fetchToolFile(file, 30_000);
  if (!response.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Failed to download attachment ${file.file_id}: ${response.status}`,
    });
  }

  const buffer = await readMediaBufferWithLimit(
    response,
    `Attachment ${file.file_id}`,
    maxBytes,
  );
  const bytes = buffer;
  const markdownType = resolveMarkdownMimeType(file.mime_type, file.file_name);
  if (markdownType) {
    assertMarkdownSize(bytes.byteLength);
    decodeMarkdownText(buffer);
    return {
      buffer,
      contentType: markdownType,
      filename: safeAttachmentFilename(file, markdownType),
      kind: "file",
    };
  }
  if (bytes.byteLength < 64) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid media payload from attachment ${file.file_id}: payload too small.`,
    });
  }

  const sniffedContentType = sniffMediaMimeType(bytes);
  const isVideo = VIDEO_MIME_TYPES.has(sniffedContentType);
  const isImage = RESOLVED_MEDIA_IMAGE_TYPES.has(sniffedContentType);
  if (!isVideo && !isImage) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Attachment ${file.file_id} is not a supported image or video type.`,
    );
  }
  if (isImage && bytes.byteLength > Math.min(MAX_IMAGE_BYTES, maxBytes)) {
    throw createError({
      statusCode: 413,
      statusMessage: `Invalid image payload from attachment ${file.file_id}: payload exceeds ${MAX_IMAGE_BYTES} byte limit.`,
    });
  }

  const filename = safeAttachmentFilename(file, sniffedContentType);
  return { buffer, contentType: sniffedContentType, filename, kind: isVideo ? "video" : "image" };
}

export interface GoogleMapsSignals {
  nameHint: string | null;
  lat: number | null;
  lng: number | null;
  rawId: string | null;
  isChijId: boolean;
}

export interface GoogleMapsPlaceCandidate {
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface GoogleMapsPlaceResolution {
  placeId: string;
  resolvedUrl: string;
  usedTextSearch: boolean;
}

interface GoogleMapsPlaceResolverDependencies {
  resolveShortLink: (_url: string) => Promise<{ ok: boolean; url: string }>;
  searchPlaces: (
    _query: string,
    _locationBias: { latitude: number; longitude: number },
  ) => Promise<GoogleMapsPlaceCandidate[]>;
}

function validCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  ) {
    return { lat, lng };
  }
  return null;
}

export async function resolveGoogleMapsPlace(
  rawUrl: string,
  dependencies: GoogleMapsPlaceResolverDependencies,
): Promise<GoogleMapsPlaceResolution> {
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

  let resolvedUrl = parsedUrl.toString();
  if (parsedUrl.hostname === "maps.app.goo.gl") {
    let probe: { ok: boolean; url: string };
    try {
      probe = await dependencies.resolveShortLink(parsedUrl.toString());
    } catch {
      throw createError({
        statusCode: 502,
        statusMessage: "Google Maps link resolution failed.",
      });
    }

    let resolvedHost: string;
    try {
      resolvedHost = new URL(probe.url).hostname;
    } catch {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "The Google Maps share link did not resolve to a valid Google Maps place URL.",
      );
    }
    if (!probe.ok || !isAllowedGoogleMapsHost(resolvedHost)) {
      throw mcpProtocolError(
        MCP_ERROR.invalidParams,
        "The Google Maps share link did not resolve to a valid Google Maps place URL.",
      );
    }
    resolvedUrl = probe.url;
  }

  const signals = extractGoogleMapsSignals(resolvedUrl);
  if (signals.isChijId && signals.rawId) {
    return {
      placeId: signals.rawId,
      resolvedUrl,
      usedTextSearch: false,
    };
  }

  if (!signals.nameHint) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "Could not extract place details from that Maps URL. Try copying the full Google Maps URL from the address bar.",
    );
  }
  const urlCoordinates = validCoordinates(signals.lat, signals.lng);
  if (!urlCoordinates) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "This URL does not contain valid location coordinates. Paste the full Google Maps URL from the address bar so the place can be identified precisely.",
    );
  }

  const locationBias = {
    latitude: urlCoordinates.lat,
    longitude: urlCoordinates.lng,
  };
  let results: GoogleMapsPlaceCandidate[];
  try {
    results = await dependencies.searchPlaces(signals.nameHint, locationBias);
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage:
        error instanceof Error ? error.message : "Google Places search failed.",
    });
  }

  const candidate = results[0];
  if (!candidate?.placeId) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `Could not find "${signals.nameHint}" in Google Places. Try the full Maps URL from the address bar.`,
    );
  }
  const candidateCoordinates = validCoordinates(candidate.lat, candidate.lng);
  if (!candidateCoordinates) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `The top search result for "${signals.nameHint}" did not include valid coordinates and could not be verified against the Maps URL.`,
    );
  }

  const distanceKm = haversineKm(
    locationBias.latitude,
    locationBias.longitude,
    candidateCoordinates.lat,
    candidateCoordinates.lng,
  );
  if (distanceKm > 5) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      `The top search result for "${signals.nameHint}" is ${Math.round(distanceKm)} km from the location in that URL. Paste the full Google Maps URL from the address bar so the exact place can be identified.`,
    );
  }

  return {
    placeId: candidate.placeId,
    resolvedUrl,
    usedTextSearch: true,
  };
}

export function extractGoogleMapsSignals(resolvedUrl: string): GoogleMapsSignals {
  const rawIdMatch = resolvedUrl.match(/!1s([^!&]+)/);
  let rawId: string | null = null;
  if (rawIdMatch?.[1]) {
    try {
      rawId = decodeURIComponent(rawIdMatch[1]);
    } catch {
      rawId = null;
    }
  }
  const isChijId = rawId ? /^ChIJ/.test(rawId) : false;

  const nameFromPath = resolvedUrl.match(/\/maps\/place\/([^/@?]+)/)?.[1];
  let nameHint: string | null = null;
  if (nameFromPath) {
    try {
      nameHint = decodeURIComponent(nameFromPath.replace(/\+/g, " "));
    } catch {
      nameHint = null;
    }
  }

  // !3d/!4d are the exact business coords; @ is the map viewport (less precise)
  const coordinatePattern = "-?\\d+(?:\\.\\d+)?";
  const lat3d = resolvedUrl.match(new RegExp(`!3d(${coordinatePattern})`))?.[1];
  const lng4d = resolvedUrl.match(new RegExp(`!4d(${coordinatePattern})`))?.[1];
  const viewportMatch = resolvedUrl.match(
    new RegExp(`@(${coordinatePattern}),(${coordinatePattern})`),
  );
  const latRaw = lat3d ?? viewportMatch?.[1] ?? null;
  const lngRaw = lng4d ?? viewportMatch?.[2] ?? null;
  const lat = latRaw != null ? Number(latRaw) : null;
  const lng = lngRaw != null ? Number(lngRaw) : null;

  return { nameHint, lat, lng, rawId, isChijId };
}

export function workspaceContextPayload(
  organization: Awaited<ReturnType<typeof resolveMcpWorkspace>>["organization"],
  site: McpSiteSummary | null,
  location: McpLocationSummary | null,
  env?: { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string },
) {
  return {
    organization_id: organization?.id ?? site?.organization_id ?? null,
    organization_name: organization?.name ?? site?.organization_name ?? null,
    organization_slug: organization?.slug ?? site?.organization_slug ?? null,
    site_id: site?.id ?? null,
    site_name: site?.brand_name ?? site?.subdomain ?? null,
    site_subdomain: site?.subdomain ?? null,
    site_public_url: resolveSitePublicOrigin(site, env),
    location_id: location?.id ?? null,
    location_slug: location?.slug ?? null,
    location_title: location?.title ?? null,
  };
}

function normalizeAbsoluteUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/\/$/, "");
}

function normalizeHostname(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function resolveSitePublicOrigin(
  site:
    | Pick<McpSiteSummary, "public_url" | "custom_domain" | "subdomain">
    | { publicUrl?: string | null; customDomain?: string | null; subdomain?: string | null }
    | null
    | undefined,
  env?: { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string },
): string | null {
  const siteRecord = (site ?? {}) as {
    public_url?: string | null;
    custom_domain?: string | null;
    publicUrl?: string | null;
    customDomain?: string | null;
    subdomain?: string | null;
  };
  const explicitPublicUrl = normalizeAbsoluteUrl(
    siteRecord.public_url ?? siteRecord.publicUrl,
  );
  if (explicitPublicUrl) return explicitPublicUrl;

  const customDomain = normalizeHostname(
    siteRecord.custom_domain ?? siteRecord.customDomain,
  );
  if (customDomain) return `https://${customDomain}`;

  const subdomain = typeof siteRecord.subdomain === "string" ? siteRecord.subdomain.trim() : "";
  if (subdomain) {
    const baseDomain = env?.NUXT_PUBLIC_FREE_SITE_DOMAIN
      ? env.NUXT_PUBLIC_FREE_SITE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : 'krabiclaw.com';
    return `https://${subdomain}.${baseDomain}`;
  }

  return null;
}

export function absolutizeSiteUrl(
  site:
    | Pick<McpSiteSummary, "public_url" | "custom_domain" | "subdomain">
    | { publicUrl?: string | null; customDomain?: string | null; subdomain?: string | null }
    | null
    | undefined,
  value: string | null | undefined,
  env?: { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string },
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const origin = resolveSitePublicOrigin(site, env);
  if (!origin) return null;

  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed.replace(/^\/+/, "")}`;
}

export function attachViewUrlToRecord<T extends object>(
  record: T,
  site:
    | Pick<McpSiteSummary, "public_url" | "custom_domain" | "subdomain">
    | { publicUrl?: string | null; customDomain?: string | null; subdomain?: string | null }
    | null
    | undefined,
  options: {
    publicPath?: string | null;
  } = {},
  env?: { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string },
): T & { public_path?: string | null; public_url: string | null; view_url: string | null } {
  const recordShape = record as Record<string, unknown>;
  const explicitPublicPath =
    options.publicPath !== undefined
      ? options.publicPath
      : (typeof recordShape.public_path === "string" ? recordShape.public_path : null);
  const canonicalUrl =
    typeof recordShape.canonical_url === "string" ? recordShape.canonical_url : null;
  const existingPublicUrl =
    typeof recordShape.public_url === "string" ? recordShape.public_url : null;
  const viewUrl =
    canonicalUrl && /^https?:\/\//i.test(canonicalUrl)
      ? canonicalUrl
      : absolutizeSiteUrl(site, explicitPublicPath ?? existingPublicUrl, env);

  return {
    ...record,
    ...(options.publicPath !== undefined ? { public_path: explicitPublicPath } : {}),
    public_url: viewUrl,
    view_url: viewUrl,
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
  env?: { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string },
) {
  return workspace.sites.map((site) => ({
    id: site.id,
    organizationId: site.organization_id,
    organizationName: site.organization_name,
    name: site.brand_name ?? site.subdomain ?? site.id,
    subdomain: site.subdomain ?? "",
    orgSlug: site.organization_slug ?? "",
    publicUrl: resolveSitePublicOrigin(site, env),
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
  void organizationId;
  void locationId;
  const { getTenantPageForEditorByPath } = await import('~/server/utils/tenant-pages');
  const page = await getTenantPageForEditorByPath(db, siteId, '/');
  const hero = page.blocks.find(entry => entry.type === 'hero');
  return {
    hero_media_asset_id: typeof hero?.data.asset_id === 'string' ? hero.data.asset_id : null,
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
    message.includes("must be an object with hero_title/hero_subtitle") ||
    message.includes("calculator rules") ||
    message.includes("calculator configuration") ||
    message.includes("pricing_calculator") ||
    message.includes("offering needs") ||
    message.includes("tenant page needs") ||
    message.includes("Navigation item ids")
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
  if (Object.prototype.hasOwnProperty.call(normalized, "price")) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, "Unknown argument: price");
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
    case "image/svg+xml":
      return "svg";
    case "image/png":
    default:
      return "png";
  }
}

export function normalizeChannelsInput(
  args: Record<string, unknown>,
): Array<"site" | "instagram" | "facebook"> {
  const rawChannels = args.channels;
  if (rawChannels !== undefined) return normalizeChannelArray(rawChannels);
  return ["site"];
}

export function normalizeChannelArray(
  value: unknown,
): Array<"site" | "instagram" | "facebook"> {
  if (!Array.isArray(value) || !value.length) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "channels must be a non-empty array when provided.",
    );
  }

  const normalized = value.filter(
    (item): item is "site" | "instagram" | "facebook" =>
      item === "site" ||
      item === "instagram" ||
      item === "facebook",
  );

  if (normalized.length !== value.length) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "channels may only contain site, facebook, or instagram.",
    );
  }

  return [...new Set(normalized)];
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
  const siteId = typeof data.siteId === "string" ? data.siteId : "";
  if (!siteId.trim()) {
    throw mcpProtocolError(
      MCP_ERROR.invalidParams,
      "Critical identifier siteId is empty or missing in site creation response",
    );
  }
  return {
    ...data,
    siteId,
  };
}


export const NOT_HANDLED = Symbol('mcp-executor-not-handled')

// Only toolName/args/site are read by domain handlers (handleMenusTools etc.) —
// event/tool/rawArguments/normalizedArguments/siteId exist for the MCP protocol
// caller (executeMcpToolCall) and are optional so non-MCP callers (ChowBot, see
// mcp-executor/chowbot-adapter.ts) can build a context without an H3Event or a
// resolved MCP tool-catalog entry.
export interface McpExecutorContext {
  event?: H3Event
  toolName: string
  rawArguments?: Record<string, unknown>
  normalizedArguments?: Record<string, unknown>
  tool?: ReturnType<typeof getMcpTool>
  siteId?: string
  site: Awaited<ReturnType<typeof requireMcpSite>>
  args: Record<string, unknown>
}
