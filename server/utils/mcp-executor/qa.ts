import type { McpExecutorContext } from './shared'
import { listLocationQa, listQa, createQa, updateQa, deleteQa, reorderQa } from '~/server/utils/location-qa'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, requiredString, assertDomainSuccess } from './shared'

export async function handleQaTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  const scope = {
    organizationId: organization.organizationId,
    locationId: (args.location_id ?? null) as string | null,
    pagePath: (args.page_path ?? null) as string | null,
  }
  switch (toolName) {
    case 'create_qa': {
      const result = await createQa(organization.db, scope, { ...args, question: args.question })
      assertDomainSuccess(result)
      return result.data
    }
    case 'update_qa':
      return await updateQa(organization.db, scope, requiredString(args, 'qa_id'), args)
    case 'delete_qa': {
      const result = await deleteQa(organization.db, scope, requiredString(args, 'qa_id'))
      assertDomainSuccess(result)
      return result.data
    }
    case 'reorder_qa':
      return await reorderQa(organization.db, scope, args.updates as Array<{ id: string; sort_order: number }>)
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
