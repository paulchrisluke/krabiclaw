import type { McpExecutorContext } from './shared'
import { copyLocationBatch, type CopyEntityType } from '~/server/utils/copy-paste'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createLocation, deleteLocation, syncLocationWhatsAppAccess, updateLocation, type LocationRecord } from '~/server/utils/location-management'
import { getLocationForMcp, hydrateSeededLocationForOnboarding } from '~/server/utils/mcp-workflows'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, optionalString, requireActiveImageAsset, requireActiveVideoAsset, requiredString, requiredStringArray, workspaceContextPayload, workspaceLocationsPayload } from './shared'
import { queryFirst } from '~/server/db'

// MCP's create_location/update_location tools write notification_phone
// through the same location-management.ts write boundary the dashboard HTTP
// routes use (validation lives there — see location-management.ts), and now
// also share that file's syncLocationWhatsAppAccess for provisioning WhatsApp
// access and recalculating scopes on change (issue #293 Sections A/G,
// CodeRabbit follow-up on PR #295 — this used to be a separate copy of the
// same provisioning/revocation logic as the dashboard PATCH route and
// add-location flow). This keeps a manager number set/changed via
// ChowBot/MCP on the same invitation + revocation treatment as one set via
// the dashboard, instead of silently going inert or drifting out of sync.
async function syncLocationWhatsAppPhone(
  site: McpExecutorContext['site'],
  locationId: string,
  previousNotificationPhone: string | null,
): Promise<{ ok: boolean; provisioningError?: string; scopeRecalcError?: string }> {
  const current = await queryFirst<{ notification_phone: string | null }>(site.db, `
    SELECT notification_phone FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1
  `, [locationId, site.organizationId, site.siteId])
  const newPhone = current?.notification_phone ?? null

  return await syncLocationWhatsAppAccess(site.env as unknown as Parameters<typeof syncLocationWhatsAppAccess>[0], site.db, {
    organizationId: site.organizationId,
    siteId: site.siteId,
    locationId,
    previousPhone: previousNotificationPhone,
    newPhone,
    inviterUserId: site.userId,
  })
}

// Mirrors the warning-surfacing convention used elsewhere in this file (e.g.
// set_location_hero_image/set_location_hero_video) — a non-fatal issue with
// a mutation that otherwise succeeded is reported via a `warning` string on
// the structured response rather than failing the whole tool call, so the
// AI/user sees the location was saved but WhatsApp access needs attention.
export function whatsAppSyncWarning(result: { ok: boolean; provisioningError?: string; scopeRecalcError?: string }): string | undefined {
  if (result.ok) return undefined
  const detail = result.provisioningError || result.scopeRecalcError || 'unknown error'
  return `The location was saved, but syncing WhatsApp manager access failed: ${detail}. Retry updating the notification phone to re-sync it.`
}

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
        context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location, site.env),
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
          context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location, site.env),
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
          site.env,
          site.db,
          site.organizationId,
          site.siteId,
          site.userId,
          args,
        );
      }
      assertDomainSuccess(result);
      const createdLocation = (result.data as { location: LocationRecord }).location;
      const createWhatsAppWarning = createdLocation.notification_phone
        ? whatsAppSyncWarning(await syncLocationWhatsAppPhone(site, createdLocation.id, null))
        : undefined;
      const createContext = await mutationContextPayload(site, { locationId: createdLocation.id });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: createdLocation.id,
          slug: createdLocation.slug,
          updated_at: createdLocation.updated_at,
          context: createContext,
          ...(createWhatsAppWarning ? { warning: createWhatsAppWarning } : {}),
        },
        `Created location "${createdLocation.title}".`,
        { ...result.data, context: createContext },
      );
    }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const updateFields = omit(args, ["location_id"]) as Record<string, unknown>;
      const touchesNotificationPhone = Object.prototype.hasOwnProperty.call(updateFields, "notification_phone");
      const previousLocationRow = touchesNotificationPhone
        ? await queryFirst<{ notification_phone: string | null }>(site.db, `
            SELECT notification_phone FROM business_locations WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1
          `, [locationId, site.organizationId, site.siteId])
        : null;
      const result = await updateLocation(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        updateFields as never,
        site.userId,
      );
      assertDomainSuccess(result);
      const updatedLocation = (result.data as { location: LocationRecord }).location;
      const updateWhatsAppWarning = touchesNotificationPhone
        ? whatsAppSyncWarning(await syncLocationWhatsAppPhone(site, locationId, previousLocationRow?.notification_phone ?? null))
        : undefined;
      const updateContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: updatedLocation.id,
          slug: updatedLocation.slug,
          changed_fields: Object.keys(omit(args, ["location_id"])),
          updated_at: updatedLocation.updated_at,
          context: updateContext,
          ...(updateWhatsAppWarning ? { warning: updateWhatsAppWarning } : {}),
        },
        `Updated "${updatedLocation.title}".`,
        { ...result.data, context: updateContext },
      );
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

      const manifest = result.manifest!;
      const copyContext = await mutationContextPayload(site, { locationId: manifest.target_location_id });
      const copiedCounts = Object.fromEntries(
        Object.entries(manifest.entities).map(([type, entity]) => [type, entity.copied]),
      );
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: manifest.target_location_id,
          slug: manifest.target_location_slug,
          copied: copiedCounts,
          context: copyContext,
        },
        `Copied ${entityTypes.join(", ")} into "${manifest.target_location_slug}".`,
        { manifest },
      );
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
      const heroImageLocation = (result.data as { location: LocationRecord }).location;
      const heroImageContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: heroImageLocation.id,
          updated_at: heroImageLocation.updated_at,
          context: heroImageContext,
          ...(currentLocation.hero_video_asset_id
            ? {
                warning:
                  "This location already has a hero video, which takes display priority over a hero image. The video will keep showing. Call clear_location_hero_video first if you want this image to display instead.",
              }
            : {}),
        },
        `Updated hero image for "${heroImageLocation.title}".`,
        { location: heroImageLocation },
      );
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
      const heroVideoLocation = (result.data as { location: LocationRecord }).location;
      const heroVideoContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: heroVideoLocation.id,
          updated_at: heroVideoLocation.updated_at,
          context: heroVideoContext,
          ...(currentLocation.hero_image_asset_id
            ? {
                warning:
                  "This location already has a hero image, but the new hero video will take display priority over it.",
              }
            : {}),
        },
        `Updated hero video for "${heroVideoLocation.title}".`,
        { location: heroVideoLocation },
      );
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
      const clearedImageLocation = (result.data as { location: LocationRecord }).location;
      const clearImageContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: clearedImageLocation.id,
          updated_at: clearedImageLocation.updated_at,
          context: clearImageContext,
        },
        `Cleared hero image for "${clearedImageLocation.title}".`,
        { location: clearedImageLocation },
      );
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
      const clearedVideoLocation = (result.data as { location: LocationRecord }).location;
      const clearVideoContext = await mutationContextPayload(site, { locationId });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: clearedVideoLocation.id,
          updated_at: clearedVideoLocation.updated_at,
          context: clearVideoContext,
        },
        `Cleared hero video for "${clearedVideoLocation.title}".`,
        { location: clearedVideoLocation },
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
