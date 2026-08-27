import type { McpExecutorContext } from './shared'
import { createWorkRequest } from '~/server/utils/work-request-management'
import { listWorkRequestsForOrganization } from '~/server/utils/mcp-workflows'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, optionalString, requiredString } from './shared'

export async function handleManagedServiceTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_work_requests":
      {
        const requests = await listWorkRequestsForOrganization(
          site.db,
          site.organizationId,
        );
        const page = paginateMcpCollection(requests, args, { resource: `work-requests:${site.organizationId}` });
        return { requests: page.items, page_info: page.page_info };
      }
    case "create_work_request": {
      const result = await createWorkRequest(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        {
          type: requiredString(args, "type"),
          title: requiredString(args, "title"),
          description: optionalString(args, "description"),
          priority: optionalString(args, "priority"),
          source: "chowbot",
        },
      );
      assertDomainSuccess(result);
      return {
        ...result.data,
        context: await mutationContextPayload(site),
      };
    }
    default:
      return NOT_HANDLED
  }
}
