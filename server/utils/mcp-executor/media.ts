import { memberAccessPrincipal } from '~/server/utils/member-access'
import type { McpExecutorContext } from './shared'
import { deleteMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { assertCloudflareImagesConfigured } from '~/server/utils/cloudflare-images'
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
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "set_media": {
      const placement = parseMediaPlacementKey(args.placement);
      if (args.asset_id !== null && (typeof args.asset_id !== 'string' || !args.asset_id.trim())) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "asset_id must be a non-empty string or null.");
      }
      const result = await setSingleMediaPlacement(organization.db, {
        env: organization.env,
        organizationId: organization.organizationId,
        principal: memberAccessPrincipal(organization.membership, { env: organization.env }),
        placement,
        assetId: typeof args.asset_id === 'string' ? args.asset_id.trim() : null,
      });
      return renderStructuredResponse(
        {
          ok: true,
          ...result,
          context: await mutationContextPayload(organization),
        },
        result.cleared ? "Cleared media placement." : "Updated media placement.",
      );
    }
    case "attach_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const assetId = requiredString(args, "asset_id");
      const result = await attachMediaPlacement(organization.db, {
        env: organization.env,
        organizationId: organization.organizationId,
        principal: memberAccessPrincipal(organization.membership, { env: organization.env }),
        placement,
        assetId,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(organization) },
        "Attached media.",
      );
    }
    case "remove_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const assetId = requiredString(args, "asset_id");
      const result = await removeMediaPlacement(organization.db, {
        env: organization.env,
        organizationId: organization.organizationId,
        principal: memberAccessPrincipal(organization.membership, { env: organization.env }),
        placement,
        assetId,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(organization) },
        "Removed media.",
      );
    }
    case "reorder_media": {
      const placement = parseMediaPlacementKey(args.placement);
      const moves = parseMediaPlacementMoves(args.moves);
      const result = await reorderMediaPlacements(organization.db, {
        env: organization.env,
        organizationId: organization.organizationId,
        principal: memberAccessPrincipal(organization.membership, { env: organization.env }),
        placement,
        moves,
      });
      return renderStructuredResponse(
        { ok: true, ...result, context: await mutationContextPayload(organization) },
        "Reordered media.",
      );
    }
    case "get_organization_media_assets": {
      const assets = await listMediaAssets(organization.db, organization.organizationId, {
          kind: optionalString(args, "kind") ?? undefined,
        });
      const page = paginateMcpCollection(assets, args, { resource: `media-assets:${organization.organizationId}:${optionalString(args, 'kind') ?? ''}` });
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
        assertCloudflareImagesConfigured(organization.env)
        const posterResolved = await resolveUserUploadedMediaFile(posterReference, MAX_POSTER_BYTES);
        if (posterResolved.kind !== "image") {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            "Poster must be an image.",
          );
        }
        poster = posterResolved;
      }

      const context = await mutationContextPayload(organization);
      const uploadInput = {
        db: organization.db,
        env: organization.env as never,
        organizationId: organization.organizationId,
        userId: organization.userId,
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
          provider: resolveImageUploadProvider(resolved.contentType, organization.env),
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
          ? "Upload complete. This file is in the media library."
          : "Upload complete. This asset is in the media library but not assigned yet. Call set_media with this asset_id and the desired target.",
        context,
      };
    }
    case "update_media_asset": {
      const updated = await updateMediaAssetMetadata(
        organization.db,
        requiredString(args, "asset_id"),
        organization.organizationId,
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
        context: await mutationContextPayload(organization),
      };
    }
    case "delete_media_asset": {
      const context = await mutationContextPayload(organization);
      await deleteMediaAsset(
        organization.db,
        organization.env,
        requiredString(args, "asset_id"),
        organization.organizationId,
        organization.userId,
      );
      return { deleted: true, context };
    }
    default:
      return NOT_HANDLED
  }
}
