import type { McpExecutorContext } from './shared'
import { getLocation, updateLocation, type LocationRecord } from '~/server/utils/location-management'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, requiredString, workspaceLocationsPayload } from './shared'

export async function handleLocationsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_locations": {
      const workspace = await resolveMcpWorkspace(
        organization.db,
        organization.env,
        organization.userId,
        { organizationId: organization.organizationId },
      );
      const page = paginateMcpCollection(workspaceLocationsPayload(workspace), args, { resource: `locations:${organization.organizationId}` });
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
          organization.db,
          organization.organizationId,
            locationId,
          ),
          context: await mutationContextPayload(organization, { locationId }),
        };
      }
    case "update_location": {
      const locationId = requiredString(args, "location_id");
      const updateFields = omit(args, ["location_id"]) as Record<string, unknown>;
      const result = await updateLocation(
        organization.db,
        organization.organizationId,
        locationId,
        updateFields as never,
        organization.userId,
        organization.env,
      );
      assertDomainSuccess(result);
      const updatedLocation = (result.data as { location: LocationRecord }).location;
      const updateContext = await mutationContextPayload(organization, { locationId });
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
