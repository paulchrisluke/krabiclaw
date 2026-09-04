// Canonical media-asset creation from resolved bytes for MCP and dashboard uploads.
import { errorChainForTelemetry } from "~/server/utils/error-telemetry";
import type { DbClient } from "~/server/db";
import { uploadImageBuffer, deleteImage } from "~/server/utils/cloudflare-images";
import { uploadToR2, buildR2Key, deleteFromR2 } from "~/server/utils/cloudflare-r2";
import { createMediaAsset, type MediaAsset } from "~/server/utils/media-asset-manager";

interface UploadResolvedMediaInputBase {
  db: DbClient;
  env: Parameters<typeof uploadImageBuffer>[0];
  siteId: string;
  organizationId: string;
  buffer: ArrayBuffer | Uint8Array<ArrayBuffer>;
  contentType: string;
  filename: string;
  category?: MediaAsset["category"] | null;
  altText?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  generationKey?: string | null;
}

type UploadResolvedMediaActor =
  | { source: 'generated'; userId: string | null }
  | { source: 'uploaded' | 'external'; userId: string }

export type UploadResolvedMediaInput = UploadResolvedMediaInputBase & UploadResolvedMediaActor & (
  | { kind: 'image'; provider?: 'cloudflare_images' | 'cloudflare_r2'; poster?: never }
  | { kind: 'file'; provider?: 'cloudflare_r2'; poster?: never }
  | {
      kind: 'video'
      provider?: 'cloudflare_r2'
      poster: { buffer: ArrayBuffer | Uint8Array<ArrayBuffer>; contentType: string; filename: string }
    }
)

export type UploadResolvedMediaResult = {
  assetId: string;
  publicUrl: string;
} & (
  | { kind: 'image' | 'file'; thumbnailUrl: string | null }
  | { kind: 'video'; thumbnailUrl: string }
)

function uploadFailure(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function uploadResolvedMediaToAssetStore(
  input: UploadResolvedMediaInput,
): Promise<UploadResolvedMediaResult> {
  const assetId = crypto.randomUUID();
  const provider = input.provider ?? (input.kind === "image" ? "cloudflare_images" : "cloudflare_r2");

  const r2Key = provider === "cloudflare_r2" ? buildR2Key(input.siteId, assetId, input.filename) : null;
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  let stage = input.kind === 'video' ? 'poster_upload' : provider === 'cloudflare_images' ? 'image_upload' : 'r2_put';
  let stageStartedAt = startedAt;
  let publicUrl: string;
  let thumbnailUrl: string | null = null;
  let imageId: string | null = null;

  try {
    if (input.kind === 'image' && provider === 'cloudflare_images') {
      const uploaded = await uploadImageBuffer(input.env, input.buffer, input.filename, input.contentType);
      imageId = uploaded.imageId;
      publicUrl = uploaded.publicUrl;
      thumbnailUrl = uploaded.thumbnailUrl;
      timings[stage] = Date.now() - stageStartedAt;
    } else {
      if (input.kind === 'video') {
        const poster = await uploadImageBuffer(input.env, input.poster.buffer, input.poster.filename, input.poster.contentType);
        imageId = poster.imageId;
        thumbnailUrl = poster.publicUrl;
        timings[stage] = Date.now() - stageStartedAt;
      }
      stage = 'r2_put';
      stageStartedAt = Date.now();
      publicUrl = await uploadToR2(input.env, r2Key!, input.buffer, input.contentType);
      timings[stage] = Date.now() - stageStartedAt;
    }

    stage = 'asset_persist';
    stageStartedAt = Date.now();
    await createMediaAsset(input.db, {
      id: assetId,
      organization_id: input.organizationId,
      site_id: input.siteId,
      kind: input.kind,
      provider,
      source: input.source,
      generation_key: input.generationKey ?? null,
      cloudflare_image_id: imageId,
      r2_key: r2Key,
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      mime_type: input.contentType,
      file_name: input.filename,
      file_size: input.fileSize ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      alt_text: input.altText ?? null,
      category: input.category ?? null,
      status: "active",
      created_by_user_id: input.userId ?? null,
    });
    timings[stage] = Date.now() - stageStartedAt;
  } catch (persistError) {
    timings[stage] = Date.now() - stageStartedAt;
    console.error({ event: 'media_upload_failed', asset_id: assetId, site_id: input.siteId,
      provider, kind: input.kind, stage, bytes: input.buffer.byteLength,
      duration_ms: Date.now() - startedAt, timings_ms: timings, errors: errorChainForTelemetry(persistError) });
    const cleanupStartedAt = Date.now();
    const cleanupErrors: Error[] = [];
    if (r2Key) {
      try {
        await deleteFromR2(input.env, r2Key);
      } catch (cleanupError) {
        cleanupErrors.push(uploadFailure(cleanupError));
        console.error({ event: 'media_cleanup_failed', asset_id: assetId, stage: 'r2_delete', errors: errorChainForTelemetry(cleanupError) });
      }
    }
    if (imageId) {
      try {
        await deleteImage(input.env, imageId);
      } catch (cleanupError) {
        cleanupErrors.push(uploadFailure(cleanupError));
        console.error({ event: 'media_cleanup_failed', asset_id: assetId, stage: 'image_delete', errors: errorChainForTelemetry(cleanupError) });
      }
    }
    console.info({ event: 'media_cleanup_completed', asset_id: assetId,
      status: cleanupErrors.length ? 'error' : 'success', duration_ms: Date.now() - cleanupStartedAt });
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [uploadFailure(persistError), ...cleanupErrors],
        `Media asset ${assetId} could not be stored or cleaned up`, { cause: persistError },
      );
    }
    throw persistError;
  }
  console.info({ event: 'media_upload_completed', asset_id: assetId, site_id: input.siteId,
    provider, kind: input.kind, bytes: input.buffer.byteLength,
    duration_ms: Date.now() - startedAt, timings_ms: timings });

  if (input.kind === 'video') {
    if (!thumbnailUrl) throw new Error(`Video asset ${assetId} did not produce a thumbnail URL`)
    return { assetId, publicUrl, thumbnailUrl, kind: 'video' }
  }
  return { assetId, publicUrl, thumbnailUrl, kind: input.kind };
}
