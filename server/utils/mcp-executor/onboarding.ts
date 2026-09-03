import type { McpExecutorContext } from './shared'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { NOT_HANDLED, optionalString, requiredString, resolveGeneratedImageFile, resolveGeneratedImageUpload, resolveImageUploadProvider, toolFileReference } from './shared'

export async function handleOnboardingTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "save_generated_image": {
      const imageData = requiredString(args, "image_data_base64");
      const prompt = optionalString(args, "prompt") ?? null;
      let upload: Awaited<ReturnType<typeof resolveGeneratedImageUpload>>;
      try {
        upload = await resolveGeneratedImageUpload(imageData);
      } catch (err) {
        console.error("[MCP] save_generated_image base64 decode error:", err);
        throw err;
      }
      console.error("[MCP] save_generated_image uploading bytes=%d contentType=%s", upload.buffer.byteLength, upload.contentType);

      const provider = resolveImageUploadProvider(upload.contentType, site.env);

      const uploaded = await uploadResolvedMediaToAssetStore({
        db: site.db,
        env: site.env as never,
        siteId: site.siteId,
        organizationId: site.organizationId,
        userId: site.userId,
        buffer: upload.buffer,
        contentType: upload.contentType,
        filename: upload.filename,
        kind: "image",
        source: "generated",
        provider,
        altText: prompt ?? "AI-generated hero image",
      });

      return {
        asset_id: uploaded.assetId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
      };
    }
    case "save_generated_image_file": {
      const attachment = toolFileReference(args.attachment_id, "attachment_id");
      const prompt = optionalString(args, "prompt") ?? null;
      const upload = await resolveGeneratedImageFile(attachment);
      const provider = resolveImageUploadProvider(upload.contentType, site.env);
      const uploaded = await uploadResolvedMediaToAssetStore({
        db: site.db,
        env: site.env as never,
        siteId: site.siteId,
        organizationId: site.organizationId,
        userId: site.userId,
        buffer: upload.buffer,
        contentType: upload.contentType,
        filename: upload.filename,
        kind: "image",
        source: "generated",
        provider,
        altText: prompt ?? attachment.file_name ?? "AI-generated image attachment",
      });

      return {
        asset_id: uploaded.assetId,
        public_url: uploaded.publicUrl,
        thumbnail_url: uploaded.thumbnailUrl,
      };
    }
    default:
      return NOT_HANDLED
  }
}
