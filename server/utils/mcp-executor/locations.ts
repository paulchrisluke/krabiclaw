import type { McpExecutorContext } from './shared'
import { copyLocationBatch, type CopyEntityType } from '~/server/utils/copy-paste'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createLocation, deleteLocation, updateLocation } from '~/server/utils/location-management'
import { getLocationForMcp, hydrateSeededLocationForOnboarding } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, optionalString, requireActiveImageAsset, requireActiveVideoAsset, requiredString, requiredStringArray, workspaceContextPayload, workspaceLocationsPayload } from './shared'

export async function handleLocationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        site.db,
        site.userId,
        site.isPlatformAdmin,
        { siteId: site.siteId },
      );
      return {
        context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
        locations: workspaceLocationsPayload(workspace),
      };
    }
    case "get_location":
      {
        const locationId = requiredString(args, "location_id");
        const workspace = await resolveMcpWorkspace(
          site.db,
          site.userId,
          site.isPlatformAdmin,
          { siteId: site.siteId, locationId },
        );
        return {
          location: await getLocationForMcp(
          site.db,
          site.organizationId,
          site.siteId,
            locationId,
          ),
          context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location),
        };
      }
    case "create_location": {
      const result = await createLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        args as never,
        site.userId,
      );
      if (
        result.status === 402 &&
        (result.data as { code?: string } | undefined)?.code ===
          "LOCATION_LIMIT_REACHED"
      ) {
        return await hydrateSeededLocationForOnboarding(
          site.db,
          site.organizationId,
          site.siteId,
          site.userId,
          args,
        );
      }
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, {
          locationId:
            typeof (result.data as { location?: { id?: string } }).location?.id === "string"
              ? (result.data as { location: { id: string } }).location.id
              : null,
        }),
      };
    }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        omit(args, ["location_id"]) as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "copy_location_batch": {
      const VALID_ENTITY_TYPES: CopyEntityType[] = [
        "menus", "menu_items", "media_assets", "site_content", "reviews", "location_qa", "experiences",
      ];
      const sourceLocationId = requiredString(args, "source_location_id");
      const targetLocationId = optionalString(args, "target_location_id");
      const newLocationTitle = optionalString(args, "new_location_title");
      if (!targetLocationId && !newLocationTitle) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Provide either target_location_id (to copy into an existing location) or new_location_title (to create a new one).",
        );
      }
      const entityTypes = requiredStringArray(args.entities, "entities");
      if (entityTypes.length === 0) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "entities must include at least one content type to copy.");
      }
      for (const type of entityTypes) {
        if (!VALID_ENTITY_TYPES.includes(type as CopyEntityType)) {
          throw mcpProtocolError(
            MCP_ERROR.invalidParams,
            `Invalid entity type "${type}". Must be one of: ${VALID_ENTITY_TYPES.join(", ")}`,
          );
        }
      }
      const includeTranslations = args.include_translations !== false;

      const result = await copyLocationBatch(
        site.env as unknown as Record<string, string | undefined>,
        site.db,
        site.organizationId,
        site.siteId,
        site.userId,
        {
          source_location_id: sourceLocationId,
          target_location_id: targetLocationId ?? undefined,
          new_location: newLocationTitle ? { title: newLocationTitle } : undefined,
          entities: entityTypes.map((type) => ({
            type: type as CopyEntityType,
            include_translations: includeTranslations,
          })),
        },
      );

      if (!result.success) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, result.error ?? "Failed to copy location data");
      }

      return {
        manifest: result.manifest,
        context: await mutationContextPayload(site, { locationId: result.manifest?.target_location_id ?? null }),
      };
    }
    case "set_location_hero_image": {
      const locationId = requiredString(args, "location_id");
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const currentLocation = await getLocationForMcp(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
      ) as { hero_video_asset_id?: string | null };
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_image_asset_id: assetId } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        ...(currentLocation.hero_video_asset_id
          ? {
              warning:
                "This location already has a hero video, which takes display priority over a hero image. The video will keep showing. Call clear_location_hero_video first if you want this image to display instead.",
            }
          : {}),
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "set_location_hero_video": {
      const locationId = requiredString(args, "location_id");
      const assetId = requiredString(args, "asset_id");
      await requireActiveVideoAsset(site.db, site.siteId, assetId, "asset_id");
      const currentLocation = await getLocationForMcp(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
      ) as { hero_image_asset_id?: string | null };
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_video_asset_id: assetId } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        ...(currentLocation.hero_image_asset_id
          ? {
              warning:
                "This location already has a hero image, but the new hero video will take display priority over it.",
            }
          : {}),
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "clear_location_hero_image": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_image_asset_id: null } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "clear_location_hero_video": {
      const locationId = requiredString(args, "location_id");
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        { hero_video_asset_id: null } as never,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "open_location_media_upload": {
      const locationId = requiredString(args, "location_id");
      const accept = optionalString(args, "accept") ?? "both";
      return renderStructuredResponse(
        {
          launched: true,
          resourceUri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
          location_id: locationId,
          context: { site_id: site.siteId, location_id: locationId, accept },
        },
        "Media upload widget launched for this location.",
      );
    }
    case "delete_location": {
      const locationId = requiredString(args, "location_id");
      const result = await deleteLocation(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        site.userId,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    default:
      return NOT_HANDLED
  }
}
