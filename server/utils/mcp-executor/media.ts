import type { McpExecutorContext } from './shared'
import { deleteMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { setMediaPlacement, type MediaPlacementTarget } from '~/server/utils/media-placement'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import {
  NOT_HANDLED,
  mutationContextPayload,
  objectRecord,
  optionalString,
  requiredString,
  resolveImageUploadProvider,
  resolveUserUploadedMediaFile,
  resolveUserUploadedMediaFileById,
  toolFileReference,
} from './shared'

export async function handleMediaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "set_media": {
      const target = mediaPlacementTarget(objectRecord(args.target, "target"));
      const assetIdsRaw = args.asset_ids;
      if (!Array.isArray(assetIdsRaw) || !assetIdsRaw.every((item): item is string => typeof item === "string")) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "asset_ids must be an array of strings.");
      }
      const result = await setMediaPlacement(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        memberId: site.memberId,
        role: site.role,
        userId: site.userId,
        env: site.env,
        target,
        assetIds: assetIdsRaw,
      });
      return renderStructuredResponse(
        {
          ok: true,
          ...result,
          context: await mutationContextPayload(site, { locationId: result.location_id }),
        },
        result.cleared ? "Cleared media placement." : "Updated media placement.",
      );
    }
    case "get_site_media_assets":
      return {
        assets: await listMediaAssets(site.db, site.siteId, {
          kind: optionalString(args, "kind") ?? undefined,
          locationId: optionalString(args, "location_id") ?? undefined,
        }),
      };
    case "upload_user_media": {
      const description = optionalString(args, "description") ?? null;
      const category = optionalString(args, "category") ?? null;
      const fileReferenceValue = args.file;
      const fileReference = fileReferenceValue !== undefined
        ? toolFileReference(fileReferenceValue, "file")
        : null;
      const fileId = optionalString(args, "file_id") ?? null;
      const posterReference = args.poster_file !== undefined
        ? toolFileReference(args.poster_file, "poster_file")
        : null;

      if (!fileReference && !fileId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "upload_user_media requires either file or file_id.",
        );
      }

      const resolved = fileReference
        ? await resolveUserUploadedMediaFile(fileReference)
        : await resolveUserUploadedMediaFileById(fileId!, site.env);

      const provider = resolved.kind === "image"
        ? resolveImageUploadProvider(resolved.contentType, site.env)
        : resolved.kind === "file" ? "cloudflare_r2" : undefined;

      let poster: { buffer: ArrayBuffer; contentType: string; filename: string } | undefined;
      if (resolved.kind === "video" && posterReference) {
        if (!hasCloudflareImagesConfig(site.env)) {
          throw new Error("Cloudflare Images not configured");
        }
        const posterResolved = await resolveUserUploadedMediaFile(posterReference);
        if (posterResolved.kind !== "image") {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            "Poster must be an image.",
          );
        }
        poster = posterResolved;
      }

      const uploaded = await uploadResolvedMediaToAssetStore({
        db: site.db,
        env: site.env as never,
        siteId: site.siteId,
        organizationId: site.organizationId,
        userId: site.userId,
        buffer: resolved.buffer,
        contentType: resolved.contentType,
        filename: resolved.filename,
        kind: resolved.kind,
        source: "uploaded",
        provider,
        category: (category as never) ?? null,
        altText: description ?? fileReference?.file_name ?? fileId,
        poster,
      });

      return {
        asset_id: uploaded.assetId,
        status: "active",
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        kind: resolved.kind,
        poster_warning: uploaded.posterWarning,
        next_step: resolved.kind === "file"
          ? "Upload complete. Call analyze_document with this asset_id to summarize it or answer questions grounded in it."
          : "Upload complete. This asset is in the media library but not assigned yet. Call set_media with this asset_id and the desired target.",
        context: await mutationContextPayload(site),
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
        site.userId,
      );
      return { deleted: true, context: await mutationContextPayload(site) };
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
    case "analyze_document": {
      const { analyzeDocumentAsset } =
        await import("~/server/utils/chowbot-media");
      return await analyzeDocumentAsset(site.db, site.env as never, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        userId: site.userId,
        assetId: requiredString(args, "asset_id"),
        question: optionalString(args, "question") ?? undefined,
      });
    }
    default:
      return NOT_HANDLED
  }
}

function mediaPlacementTarget(raw: Record<string, unknown>): MediaPlacementTarget {
  const type = requiredString(raw, "type") as MediaPlacementTarget["type"];
  if (type === "site_logo" || type === "home_story_image" || type === "about_story_image") return { type };
  if (type === "home_hero") return { type, location_id: optionalString(raw, "location_id") ?? null };
  if (type === "location_hero") return { type, location_id: requiredString(raw, "location_id") };
  if (type === "menu_item_media") return { type, menu_item_id: requiredString(raw, "menu_item_id") };
  if (type === "post_image") return { type, post_id: requiredString(raw, "post_id") };
  if (type === "blog_post_image") return { type, post_id: requiredString(raw, "post_id") };
  if (type === "experience_media") return { type, experience_id: requiredString(raw, "experience_id") };
  throw mcpProtocolError(MCP_ERROR.invalidParams, `Unsupported media placement target: ${type}`);
}
