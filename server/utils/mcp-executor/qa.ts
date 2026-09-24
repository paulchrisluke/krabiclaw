import type { McpExecutorContext } from './shared'
import { listLocationQa, listQa } from '~/server/utils/location-qa'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, requiredString } from './shared'

export async function handleQaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_organization_qa":
      {
        const items = await listQa(organization.db, organization.organizationId, null, false, typeof args.page_path === "string" ? args.page_path : null);
        const page = paginateMcpCollection(items, args, { resource: `organization-qa:${organization.organizationId}:${typeof args.page_path === 'string' ? args.page_path : ''}` });
        return { items: page.items, page_info: page.page_info };
      }
    case "list_location_qa":
      {
        const locationId = requiredString(args, "location_id");
        const items = await listLocationQa(
          organization.db,
          organization.organizationId,
          locationId,
        );
        const page = paginateMcpCollection(items, args, { resource: `location-qa:${organization.organizationId}:${locationId}` });
        return { items: page.items, page_info: page.page_info };
      }
    default:
      return NOT_HANDLED
  }
}
