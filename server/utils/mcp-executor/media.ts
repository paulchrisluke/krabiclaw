import type { McpExecutorContext } from './shared'
import { deleteMediaAsset, listMediaAssets, updateMediaAssetMetadata } from '~/server/utils/media-asset-manager'
import { NOT_HANDLED, mutationContextPayload, optionalString, requiredString } from './shared'

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
    default:
      return NOT_HANDLED
  }
}
