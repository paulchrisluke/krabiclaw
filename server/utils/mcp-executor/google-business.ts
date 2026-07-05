import type { McpExecutorContext } from './shared'
import { getGoogleBusinessLocationAuthUrlForMcp, getGoogleBusinessLocationConnectionForMcp, listGoogleBusinessAccountsForMcp, syncGoogleBusinessLocationsForMcp } from '~/server/utils/mcp-workflows'
import { NOT_HANDLED, requiredString, requiredStringArray } from './shared'

export async function handleGoogleBusinessTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "get_google_business_connection":
      return {
        connection: await getGoogleBusinessLocationConnectionForMcp(
          site.env,
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "get_google_business_auth_url":
      return await getGoogleBusinessLocationAuthUrlForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "location_id"),
        site.userId,
      );
    case "list_google_business_accounts":
      return await listGoogleBusinessAccountsForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
      );
    case "sync_google_business_locations":
      return await syncGoogleBusinessLocationsForMcp(
        site.env,
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "account_id"),
        requiredStringArray(args, "location_ids"),
      );
    default:
      return NOT_HANDLED
  }
}
