import type { McpExecutorContext } from './shared'
import { listLocationReviews } from '~/server/utils/mcp-workflows'
import { listOrganizationReviews } from '~/server/utils/organization-reviews'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, requiredString } from './shared'

export async function handleReviewsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  switch (toolName) {
    case "list_organization_reviews":
      {
        const reviews = await listOrganizationReviews(organization.db, organization.organizationId);
        const page = paginateMcpCollection(reviews, args, { resource: `organization-reviews:${organization.organizationId}` });
        return { reviews: page.items, page_info: page.page_info };
      }
    case "list_location_reviews":
      {
        const locationId = requiredString(args, "location_id");
        const reviews = await listLocationReviews(
          organization.db,
          organization.organizationId,
          locationId,
        );
        const page = paginateMcpCollection(reviews, args, { resource: `location-reviews:${organization.organizationId}:${locationId}` });
        return { reviews: page.items, page_info: page.page_info };
      }
    default:
      return NOT_HANDLED
  }
}
