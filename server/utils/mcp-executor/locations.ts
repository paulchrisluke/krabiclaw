import type { McpExecutorContext } from './shared'
import { getLocation, updateLocation, type LocationRecord } from '~/server/utils/location-management'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, requiredString, workspaceLocationsPayload } from './shared'

export async function handleLocationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        site.db,
        site.env,
        site.userId,
        { organizationId: site.organizationId },
      );
      const page = paginateMcpCollection(workspaceLocationsPayload(workspace), args, { resource: `locations:${site.organizationId}` });
      return {
        context: workspaceContextPayload(workspace.organization, workspace.location),
        locations: page.items,
        page_info: page.page_info,
      };
    }
    case "get_location":
      {
        const locationId = requiredString(args, "location_id");
        return {
          location: await getLocation(
          site.db,
          site.organizationId,
            locationId,
          ),
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const updateFields = omit(args, ["location_id"]) as Record<string, unknown>;
      const result = await updateLocation(
        site.db,
        site.organizationId,
        locationId,
        updateFields as never,
        site.userId,
        site.env,
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
    default:
      return NOT_HANDLED
  }
}
