import type { McpExecutorContext } from './shared'
import { deleteMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { MAX_POSTER_BYTES } from '~/server/utils/media-mime'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import {
  attachMediaPlacement,
  parseMediaPlacementKey,
  parseMediaPlacementMoves,
  removeMediaPlacement,
  reorderMediaPlacements,
  setSingleMediaPlacement,
} from '~/server/utils/media-placement'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import {
  NOT_HANDLED,
  mutationContextPayload,
  optionalString,
  requiredString,
  resolveImageUploadProvider,
  resolveUserUploadedMediaFile,
  toolFileReference,
} from './shared'

export async function handleMediaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "set_media": {
      const placement = parseMediaPlacementKey(args.placement);
      if (args.asset_id !== null && (typeof args.asset_id !== 'string' || !args.asset_id.trim())) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "asset_id must be a non-empty string or null.");
      }
      const result = await setSingleMediaPlacement(site.db, {
        env: site.env,
        organizationId: site.organizationId,
        siteId: site.siteId,
        memberId: site.memberId,
        role: site.role,
        placement,
        assetId: typeof args.asset_id === 'string' ? args.asset_id.trim() : null,
      });
      return renderStructuredResponse(
        {
          ok: true,
          ...result,
          context: await mutationContextPayload(site),
        },
        result.cleared ? "Cleared media placement." : "Updated media placement.",
      );
    }
    case "attach_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const assetId = requiredString(args, "asset_id");
      const result = await attachMediaPlacement(site.db, {
        env: site.env,
        organizationId: site.organizationId,
        siteId: site.siteId,
        memberId: site.memberId,
        role: site.role,
        placement,
        assetId,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(site) },
        "Attached media.",
      );
    }
    case "remove_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const assetId = requiredString(args, "asset_id");
      const result = await removeMediaPlacement(site.db, {
        env: site.env,
        organizationId: site.organizationId,
        siteId: site.siteId,
        memberId: site.memberId,
        role: site.role,
        placement,
        assetId,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(site) },
        "Removed media.",
      );
    }
    case "reorder_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const moves = parseMediaPlacementMoves(args.moves);
      const result = await reorderMediaPlacements(site.db, {
        env: site.env,
        organizationId: site.organizationId,
        siteId: site.siteId,
        memberId: site.memberId,
        role: site.role,
        placement,
        moves,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(site) },
        "Reordered media.",
      );
    }
    case "get_site_media_assets": {
      const assets = await listMediaAssets(site.db, site.siteId, {
          kind: optionalString(args, "kind") ?? undefined,
        });
      const page = paginateMcpCollection(assets, args, { resource: `media-assets:${site.siteId}:${optionalString(args, 'kind') ?? ''}` });
      return {
        assets: page.items.map(({ id, ...asset }) => ({ asset_id: id, ...asset })),
        page_info: page.page_info,
      };
    }
    case "upload_user_media": {
      const description = optionalString(args, "description") ?? null;
      const category = optionalString(args, "category") ?? null;
      const fileReferenceValue = args.file;
      const fileReference = toolFileReference(fileReferenceValue, "file");
      const posterReference = args.poster_file !== undefined
        ? toolFileReference(args.poster_file, "poster_file")
        : null;

      const resolved = await resolveUserUploadedMediaFile(fileReference);
      if (posterReference && resolved.kind !== "video") {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "poster_file is only valid when file is a video.",
        );
      }
      if (resolved.kind === "video" && !posterReference) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Video uploads require poster_file so every video has a thumbnail.",
        );
      }

      let poster: { buffer: Uint8Array<ArrayBuffer>; contentType: string; filename: string } | undefined;
      if (resolved.kind === "video" && posterReference) {
        if (!hasCloudflareImagesConfig(site.env)) {
          throw new Error("Cloudflare Images not configured");
        }
        const posterResolved = await resolveUserUploadedMediaFile(posterReference, MAX_POSTER_BYTES);
        if (posterResolved.kind !== "image") {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            "Poster must be an image.",
          );
        }
        poster = posterResolved;
      }

      const context = await mutationContextPayload(site);
      const uploadInput = {
        db: site.db,
        env: site.env as never,
        siteId: site.siteId,
        organizationId: site.organizationId,
        userId: site.userId,
        buffer: resolved.buffer,
        contentType: resolved.contentType,
        filename: resolved.filename,
        source: "uploaded",
        category: (category as never) ?? null,
        altText: description ?? fileReference.file_name ?? fileReference.file_id,
      } as const
      let uploaded
      if (resolved.kind === 'video') {
        if (!poster) throw new Error('Resolved video upload did not include its required thumbnail')
        uploaded = await uploadResolvedMediaToAssetStore({
          ...uploadInput,
          kind: 'video',
          provider: 'cloudflare_r2',
          poster,
        })
      } else if (resolved.kind === 'image') {
        uploaded = await uploadResolvedMediaToAssetStore({
          ...uploadInput,
          kind: 'image',
          provider: resolveImageUploadProvider(resolved.contentType, site.env),
        })
      } else {
        uploaded = await uploadResolvedMediaToAssetStore({
          ...uploadInput,
          kind: 'file',
          provider: 'cloudflare_r2',
        })
      }

      return {
        asset_id: uploaded.assetId,
        status: "active",
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        kind: resolved.kind,
        next_step: resolved.kind === "file"
          ? "Upload complete. Call analyze_document with this asset_id to summarize it or answer questions grounded in it."
          : "Upload complete. This asset is in the media library but not assigned yet. Call set_media with this asset_id and the desired target.",
        context,
      };
    }
    case "update_media_asset": {
      const updated = await updateMediaAssetMetadata(
        site.db,
        requiredString(args, "asset_id"),
        site.siteId,
        {
          alt_text: optionalString(args, "alt_text"),
          category: (optionalString(args, "category") as never),
        },
      );
      if (!updated) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Media asset not found.");
      }
      return {
        updated,
        context: await mutationContextPayload(site),
      };
    }
    case "delete_media_asset": {
      const context = await mutationContextPayload(site);
      await deleteMediaAsset(
        site.db,
        site.env,
        requiredString(args, "asset_id"),
        site.siteId,
        site.userId,
      );
      return { deleted: true, context };
    }
    case "analyze_document": {
      const { analyzeDocumentAsset } =
        await import("~/server/utils/chowbot-media");
      return await analyzeDocumentAsset(site.db, site.env as never, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        userId: site.userId,
        assetId: requiredString(args, "asset_id"),
        sessionId: site.sessionId,
        question: optionalString(args, "question") ?? undefined,
      });
    }
    default:
      return NOT_HANDLED
  }
}
