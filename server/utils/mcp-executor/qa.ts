import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createLocationQa, deleteLocationQa, listLocationQa } from '~/server/utils/location-qa'
import { reorderLocationQa, updateLocationQa } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, objectArray, omit, requiredString } from './shared'

export async function handleQaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "list_location_qa":
      return {
        items: await listLocationQa(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "create_location_qa": {
      const locationId = requiredString(args, "location_id");
      const result = await createLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        omit(args, ["location_id"]) as never,
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "update_location_qa":
      {
        const locationId = requiredString(args, "location_id");
        const updated = await updateLocationQa(
          site.db,
          site.organizationId,
          site.siteId,
          locationId,
          requiredString(args, "qa_id"),
          omit(args, ["location_id", "qa_id"]),
        );
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    case "delete_location_qa": {
      const locationId = requiredString(args, "location_id");
      const result = await deleteLocationQa(
        site.db,
        site.siteId,
        locationId,
        requiredString(args, "qa_id"),
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site, { locationId }),
      };
    }
    case "reorder_location_qa":
      {
        const locationId = requiredString(args, "location_id");
        const updated = await reorderLocationQa(
        site.db,
        site.organizationId,
        site.siteId,
        locationId,
        objectArray(args.updates, "updates").map((item) => {
          const sortOrder = item.sort_order;
          if (
            typeof sortOrder !== "number" ||
            !Number.isFinite(sortOrder) ||
            !Number.isInteger(sortOrder)
          ) {
            throw mcpProtocolError(
              MCP_ERROR.invalidParams,
              "Each update must have an integer sort_order",
            );
          }
          return { id: requiredString(item, "id"), sort_order: sortOrder };
        }),
        );
        return {
          ...updated,
          context: await mutationContextPayload(site, { locationId }),
        };
      }
    default:
      return NOT_HANDLED
  }
}
