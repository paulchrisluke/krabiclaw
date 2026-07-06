// Canonical media-asset creation from already-resolved bytes. Shared by every
// MCP upload tool (upload_user_media, upload_user_photo, save_generated_image,
// save_generated_image_file) AND the dashboard's video/file upload route
// (server/api/editor/sites/[siteId]/media/upload.post.ts). Consolidates the
// uploadImageBuffer/uploadToR2 + createMediaAsset sequence that used to be
// duplicated per call site. Never a parallel path to
// server/utils/cloudflare-images.ts, cloudflare-r2.ts, or
// media-asset-manager.ts — always the same provider calls those call sites used.
import type { DbClient } from "~/server/db";
import { uploadImageBuffer, deleteImage } from "~/server/utils/cloudflare-images";
import { uploadToR2, buildR2Key, deleteFromR2 } from "~/server/utils/cloudflare-r2";
import { assertPublicMediaUrl } from "~/server/utils/public-media-verification";
import { createMediaAsset, type MediaAsset } from "~/server/utils/media-asset-manager";

export interface UploadResolvedMediaInput {
  db: DbClient;
  env: Parameters<typeof uploadImageBuffer>[0];
  siteId: string;
  organizationId: string;
  userId: string;
  buffer: ArrayBuffer;
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
  poster?: { buffer: ArrayBuffer; contentType: string; filename: string };
}

export interface UploadResolvedMediaResult {
  assetId: string;
  publicUrl: string;
  thumbnailUrl: string | null;
  posterWarning: string | null;
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
        console.error("media_upload_cleanup_failed", { assetId, imageId: uploaded.imageId, error: cleanupError });
      }
      throw persistError;
    }
    return { assetId, publicUrl: uploaded.publicUrl, thumbnailUrl: uploaded.thumbnailUrl, posterWarning: null };
  }

  let thumbnailUrl: string | null = null;
  let posterImageId: string | null = null;
  let posterWarning: string | null = null;

  if (input.poster) {
    try {
      const uploadedPoster = await uploadImageBuffer(
        input.env,
        input.poster.buffer,
        input.poster.filename,
        input.poster.contentType,
      );
      posterImageId = uploadedPoster.imageId;
      thumbnailUrl = uploadedPoster.publicUrl;
    } catch (posterError) {
      console.error("media_upload_poster_failed", { assetId, error: posterError });
      posterWarning = "The poster image could not be uploaded, so this video will not have a thumbnail yet.";
    }
  }

  const r2Key = buildR2Key(input.siteId, assetId, input.filename);
  const publicUrl = await uploadToR2(input.env, r2Key, input.buffer, input.contentType);

  try {
    if (import.meta.dev) {
      try {
        await assertPublicMediaUrl(publicUrl, input.contentType, {
          attempts: 2,
          retryDelaysMs: [100],
          timeoutMs: 750,
        });
      } catch (verificationError) {
        console.warn("media_upload_public_url_verification_skipped_in_dev", {
          assetId,
          publicUrl,
          error: verificationError,
        });
      }
    } else {
      await assertPublicMediaUrl(publicUrl, input.contentType);
    }

    await createMediaAsset(input.db, {
      id: assetId,
      organization_id: input.organizationId,
      site_id: input.siteId,
      location_id: input.locationId ?? null,
      kind: input.kind,
      provider: "cloudflare_r2",
      source: input.source,
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
    try {
      await deleteFromR2(input.env, r2Key);
    } catch (cleanupError) {
      console.error("media_upload_cleanup_failed", { assetId, r2Key, error: cleanupError });
    }
    if (posterImageId) {
      try {
        await deleteImage(input.env, posterImageId);
      } catch (cleanupError) {
        console.error("media_upload_poster_cleanup_failed", { assetId, posterImageId, error: cleanupError });
      }
    }
    throw persistError;
  }

  return { assetId, publicUrl, thumbnailUrl, posterWarning };
}
