import type { McpExecutorContext } from './shared'
import { deleteMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import {
  NOT_HANDLED,
  mutationContextPayload,
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
        assetId: uploaded.assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        kind: resolved.kind,
        posterWarning: uploaded.posterWarning,
        nextStep: resolved.kind === "file"
          ? "Upload complete. Call analyze_document with this assetId to summarize it or answer questions grounded in it."
          : "Upload complete. This asset is in the media library but not assigned yet. Call the matching assignment tool next (e.g. set_home_hero_image, set_home_hero_video, set_experience_image, set_experience_video).",
        context: await mutationContextPayload(site),
      };
    }
    case "open_media_upload": {
      const category = optionalString(args, "category") ?? null;
      const accept = optionalString(args, "accept") ?? "both";
      return renderStructuredResponse(
        {
          launched: true,
          resourceUri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
          context: { site_id: site.siteId, category, accept },
        },
        "Media upload widget launched.",
      );
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
