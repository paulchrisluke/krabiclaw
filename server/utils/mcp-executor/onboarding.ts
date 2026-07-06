import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { getPlatformDomain } from '~/server/utils/notifications'
import { createPreviewToken } from '~/server/utils/preview-token'
import { getFreeSiteDomain } from '~/server/utils/tenant-hosts'
import { getSiteForMcp } from '~/server/utils/mcp-workflows'
import { hasCloudflareImagesConfig } from '~/server/utils/cloudflare-images'
import { uploadResolvedMediaToAssetStore } from '~/server/utils/media-upload'
import { queryAll } from '~/server/db'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { NOT_HANDLED, mutationContextPayload, optionalString, requiredString, resolveGeneratedImageFile, resolveGeneratedImageUpload, resolveImageUploadProvider, resolveUserUploadedImageFile, toolFileReference } from './shared'

export async function handleOnboardingTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "show_site_preview": {
      const siteRow = await getSiteForMcp(
        site.db,
        site.siteId,
        site.userId,
        site.isPlatformAdmin,
      );
      const subdomain = (siteRow as Record<string, unknown>).subdomain as string | null | undefined;
      const customDomain = (siteRow as Record<string, unknown>).custom_domain as string | null | undefined;
      const platformDomain = `https://${getPlatformDomain(site.env as { NUXT_PUBLIC_PLATFORM_DOMAIN?: string })}`;
      const freeSiteDomain = getFreeSiteDomain(site.env as { NUXT_PUBLIC_FREE_SITE_DOMAIN?: string; NUXT_PUBLIC_PLATFORM_DOMAIN?: string });
      const previewSecret = (site.env as Record<string, unknown>).PREVIEW_SECRET as string | undefined;
      let previewUrl = `${platformDomain}/preview/site/${site.siteId}`;
      if (previewSecret) {
        const token = await createPreviewToken(previewSecret, site.siteId, Date.now() + 60 * 60 * 1000);
        previewUrl = `${previewUrl}?preview=true&token=${token}`;
      }
      const publicUrl = customDomain
        ? `https://${customDomain}`
        : subdomain
          ? `https://${subdomain}.${freeSiteDomain}`
          : previewUrl;
      const locationRows = await queryAll<{
        slug: string;
        title: string;
        hero_image_public_url: string | null;
      }>(
        site.db,
        `SELECT bl.slug, bl.title, ma.public_url AS hero_image_public_url
         FROM business_locations bl
         LEFT JOIN media_assets ma ON bl.hero_image_asset_id = ma.id AND ma.status = 'active'
         WHERE bl.site_id = ?
         ORDER BY bl.is_primary DESC, bl.title ASC
         LIMIT 5`,
        [site.siteId],
      );
      const locationPages = locationRows.map((loc) => ({
        label: loc.title,
        path: `/locations/${loc.slug}`,
      }));
      const pages = [{ label: "Home", path: "/" }, ...locationPages];
      const ogImageUrl = locationRows[0]?.hero_image_public_url ?? null;
      const siteName = String((siteRow as Record<string, unknown>).brand_name ?? subdomain ?? site.siteId);
      return renderStructuredResponse(
        {
          site: {
            id: site.siteId,
            name: siteName,
            subdomain: subdomain ?? null,
            publicUrl,
            previewUrl,
          },
          pages,
          ogImageUrl,
        },
        subdomain ? `Your site is live at ${publicUrl}` : `Your site preview is ready — ${siteName}`,
      );
    }
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
        uploaded: true,
        assigned: false,
        assetId: uploaded.assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        nextStep:
          "Upload complete. This image is in the media library but not assigned yet. Call a placement tool like set_home_hero_image or set_logo next.",
        context: await mutationContextPayload(site),
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
        assetId: uploaded.assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        context: await mutationContextPayload(site),
      };
    }
    case "upload_user_photo": {
      const description = optionalString(args, "description") ?? null;
      const category = optionalString(args, "category") ?? null;
      const fileReferenceValue = args.file;
      const fileReference =
        fileReferenceValue !== undefined
          ? toolFileReference(fileReferenceValue, "file")
          : null;
      const fileId = optionalString(args, "file_id") ?? null;

      if (!fileReference && !fileId) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "upload_user_photo requires either file or file_id.",
        );
      }

      const upload = fileReference
        ? await resolveGeneratedImageFile(fileReference)
        : await resolveUserUploadedImageFile(fileId!, site.env);
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
        source: "uploaded",
        provider,
        altText: description ?? fileReference?.file_name ?? fileId,
        category: (category as never) ?? null,
      });

      return {
        assetId: uploaded.assetId,
        publicUrl: uploaded.publicUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        context: await mutationContextPayload(site),
      };
    }
    default:
      return NOT_HANDLED
  }
}
