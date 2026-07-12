import type { McpExecutorContext } from './shared'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createLocationQa, createQa, deleteLocationQa, deleteQa, listLocationQa, listPageQa, listQa, reorderQa, updateQa } from '~/server/utils/location-qa'
import { reorderLocationQa, updateLocationQa } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, objectArray, omit, requiredString } from './shared'

export async function handleQaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_site_qa":
      return { items: typeof args.page_path === "string" ? await listPageQa(site.db, site.siteId, args.page_path) : await listQa(site.db, site.siteId, null) };
    case "create_site_qa": {
      const result = await createQa(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        locationId: null,
        pagePath: typeof args.page_path === "string" ? args.page_path : null,
      }, omit(args, ["page_path"]) as never);
      assertDomainSuccess(result);
      return { ...result.data, context: await mutationContextPayload(site) };
    }
    case "update_site_qa": {
      const qaId = requiredString(args, "qa_id");
      const result = await updateQa(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        locationId: null,
        pagePath: typeof args.page_path === "string" ? args.page_path : null,
      }, qaId, omit(args, ["qa_id", "page_path"]));
      return { ...result, context: await mutationContextPayload(site) };
    }
    case "delete_site_qa": {
      const result = await deleteQa(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        locationId: null,
        pagePath: typeof args.page_path === "string" ? args.page_path : null,
      }, requiredString(args, "qa_id"));
      assertDomainSuccess(result);
      return { ...result.data, context: await mutationContextPayload(site) };
    }
    case "reorder_site_qa": {
      const result = await reorderQa(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        locationId: null,
        pagePath: typeof args.page_path === "string" ? args.page_path : null,
      }, objectArray(args.updates, "updates").map(item => {
        const sortOrder = Number(item.sort_order);
        if (!Number.isInteger(sortOrder)) throw mcpProtocolError(MCP_ERROR.invalidParams, "Each update must have an integer sort_order");
        return { id: requiredString(item, "id"), sort_order: sortOrder };
      }));
      return { ...result, context: await mutationContextPayload(site) };
    }
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
