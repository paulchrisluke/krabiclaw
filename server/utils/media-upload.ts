// Canonical media-asset creation from resolved bytes for MCP and dashboard uploads.
import type { DbClient } from "~/server/db";
import { uploadImageBuffer, deleteImage } from "~/server/utils/cloudflare-images";
import { uploadToR2, buildR2Key, deleteFromR2 } from "~/server/utils/cloudflare-r2";
import { createMediaAsset, type MediaAsset } from "~/server/utils/media-asset-manager";

export interface UploadResolvedMediaInput {
  db: DbClient;
  env: Parameters<typeof uploadImageBuffer>[0];
  siteId: string;
  organizationId: string;
  userId: string;
  buffer: ArrayBuffer | Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
  kind: MediaAsset["kind"];
  source: MediaAsset["source"];
  /**
   * Provider override. Defaults to cloudflare_images for kind "image" and
   * cloudflare_r2 for kind "video"/"file". Pass "cloudflare_r2" explicitly
   * for image kinds Cloudflare Images can't ingest (e.g. avif), matching the
   * dashboard's video/file upload route.
   */
  provider?: MediaAsset["provider"];
  category?: MediaAsset["category"] | null;
  locationId?: string | null;
  altText?: string | null;
  fileSize?: number | null;
  /**
   * Optional poster/thumbnail image for a video upload. Uploaded via
   * Cloudflare Images and stored as the video asset's thumbnail_url — this
   * does NOT create a separate media_asset row, matching how the dashboard's
   * upload route embeds a video's poster.
   */
  poster?: { buffer: ArrayBuffer | Uint8Array<ArrayBuffer>; contentType: string; filename: string };
}

export interface UploadResolvedMediaResult {
  assetId: string;
  publicUrl: string;
  thumbnailUrl: string | null;
}

function uploadFailure(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function uploadResolvedMediaToAssetStore(
  input: UploadResolvedMediaInput,
): Promise<UploadResolvedMediaResult> {
  const assetId = crypto.randomUUID();
  const provider = input.provider ?? (input.kind === "image" ? "cloudflare_images" : "cloudflare_r2");

  if (provider === "cloudflare_images") {
    const uploaded = await uploadImageBuffer(input.env, input.buffer, input.filename, input.contentType);
    try {
      await createMediaAsset(input.db, {
        id: assetId,
        organization_id: input.organizationId,
        site_id: input.siteId,
        location_id: input.locationId ?? null,
        kind: input.kind,
        provider: "cloudflare_images",
        source: input.source,
        cloudflare_image_id: uploaded.imageId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
        mime_type: input.contentType,
        file_name: input.filename,
        file_size: input.fileSize ?? null,
        alt_text: input.altText ?? null,
        category: input.category ?? null,
        status: "active",
        created_by_user_id: input.userId,
      });
    } catch (persistError) {
      try {
        await deleteImage(input.env, uploaded.imageId);
      } catch (cleanupError) {
        throw new AggregateError(
          [uploadFailure(persistError), uploadFailure(cleanupError)],
          `Media asset ${assetId} could not be persisted or cleaned up`,
        );
      }
      throw persistError;
    }
    return { assetId, publicUrl: uploaded.publicUrl, thumbnailUrl: uploaded.thumbnailUrl };
  }

  const r2Key = buildR2Key(input.siteId, assetId, input.filename);
  let publicUrl: string;
  let thumbnailUrl: string | null = null;
  let posterImageId: string | null = null;

  try {
    if (input.poster) {
      const uploadedPoster = await uploadImageBuffer(
        input.env,
        input.poster.buffer,
        input.poster.filename,
        input.poster.contentType,
      );
      posterImageId = uploadedPoster.imageId;
      thumbnailUrl = uploadedPoster.publicUrl;
    }

    publicUrl = await uploadToR2(input.env, r2Key, input.buffer, input.contentType);

    await createMediaAsset(input.db, {
      id: assetId,
      organization_id: input.organizationId,
      site_id: input.siteId,
      location_id: input.locationId ?? null,
      kind: input.kind,
      provider: "cloudflare_r2",
      source: input.source,
      cloudflare_image_id: posterImageId,
      r2_key: r2Key,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      mime_type: input.contentType,
      file_name: input.filename,
      file_size: input.fileSize ?? null,
      alt_text: input.altText ?? null,
      category: input.category ?? null,
      status: "active",
      created_by_user_id: input.userId,
    });
  } catch (persistError) {
    const cleanupErrors: Error[] = [];
    try {
      await deleteFromR2(input.env, r2Key);
    } catch (cleanupError) {
      cleanupErrors.push(uploadFailure(cleanupError));
    }
    if (posterImageId) {
      try {
        await deleteImage(input.env, posterImageId);
      } catch (cleanupError) {
        cleanupErrors.push(uploadFailure(cleanupError));
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [uploadFailure(persistError), ...cleanupErrors],
        `Media asset ${assetId} could not be stored or cleaned up`,
      );
    }
    throw persistError;
  }

  return { assetId, publicUrl, thumbnailUrl };
}
