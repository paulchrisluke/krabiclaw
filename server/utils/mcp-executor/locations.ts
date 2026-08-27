import type { McpExecutorContext } from './shared'
import { copyLocationBatch, type CopyEntityType } from '~/server/utils/copy-paste'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createLocation, deleteLocation, updateLocation, type LocationRecord } from '~/server/utils/location-management'
import { getLocationForMcp, hydrateSeededLocationForOnboarding } from '~/server/utils/mcp-workflows'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, optionalString, requiredString, requiredStringArray, workspaceLocationsPayload } from './shared'

export async function handleLocationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        site.db,
        site.env,
        site.userId,
        { siteId: site.siteId },
      );
      const page = paginateMcpCollection(workspaceLocationsPayload(workspace), args, { resource: `locations:${site.siteId}` });
      return {
        context: workspaceContextPayload(workspace.organization, workspace.site, workspace.location, site.env),
        locations: page.items,
        page_info: page.page_info,
      };
    }
    case "get_location":
      {
        const locationId = requiredString(args, "location_id");
        return {
          location: await getLocationForMcp(
          site.db,
          site.organizationId,
          site.siteId,
            locationId,
          ),
          context: await mutationContextPayload(site, { locationId }),
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
      const createContext = await mutationContextPayload(site, { locationId: createdLocation.id });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "location",
          id: createdLocation.id,
          slug: createdLocation.slug,
          updated_at: createdLocation.updated_at,
          context: createContext,
        },
        `Created location "${createdLocation.title}".`,
        { ...result.data, context: createContext },
      );
    }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const updateFields = omit(args, ["location_id"]) as Record<string, unknown>;
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
        },
        `Updated "${updatedLocation.title}".`,
        { ...result.data, context: updateContext },
      );
    }
    case "copy_location_batch": {
      const VALID_ENTITY_TYPES: CopyEntityType[] = [
        "products", "media_assets", "reviews", "location_qa", "experiences",
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
      const result = await copyLocationBatch(
        site.env,
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
