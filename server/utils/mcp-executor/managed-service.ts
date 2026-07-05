import type { McpExecutorContext } from './shared'
import { createWorkRequest } from '~/server/utils/work-request-management'
import { listWorkRequestsForOrganization } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, optionalString, requiredString } from './shared'

export async function handleManagedServiceTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "list_work_requests":
      return {
        requests: await listWorkRequestsForOrganization(
          site.db,
          site.organizationId,
        ),
      };
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
