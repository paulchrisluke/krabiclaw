// Canonical media-asset creation from resolved bytes for MCP and dashboard uploads.
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

  if (input.kind === 'image' && provider === "cloudflare_images") {
    const uploaded = await uploadImageBuffer(input.env, input.buffer, input.filename, input.contentType);
    try {
      await createMediaAsset(input.db, {
        id: assetId,
        organization_id: input.organizationId,
        site_id: input.siteId,
        kind: input.kind,
        provider: "cloudflare_images",
        source: input.source,
        generation_key: input.generationKey ?? null,
        cloudflare_image_id: uploaded.imageId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
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
    return { assetId, publicUrl: uploaded.publicUrl, thumbnailUrl: uploaded.thumbnailUrl, kind: 'image' };
  }

  const r2Key = buildR2Key(input.siteId, assetId, input.filename);
  let publicUrl: string;
  let thumbnailUrl: string | null = null;
  let posterImageId: string | null = null;

  try {
    if (input.kind === 'video') {
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
      kind: input.kind,
      provider: "cloudflare_r2",
      source: input.source,
      generation_key: input.generationKey ?? null,
      cloudflare_image_id: posterImageId,
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

  if (input.kind === 'video') {
    if (!thumbnailUrl) throw new Error(`Video asset ${assetId} did not produce a thumbnail URL`)
    return { assetId, publicUrl, thumbnailUrl, kind: 'video' }
  }
  return { assetId, publicUrl, thumbnailUrl, kind: input.kind };
}
