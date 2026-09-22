import type { McpExecutorContext } from './shared'
import { listLocationReviews } from '~/server/utils/mcp-workflows'
import { listSiteReviews } from '~/server/utils/site-reviews'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { NOT_HANDLED, requiredString } from './shared'

export async function handleReviewsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_site_reviews":
      {
        const reviews = await listSiteReviews(site.db, site.organizationId);
        const page = paginateMcpCollection(reviews, args, { resource: `site-reviews:${site.organizationId}` });
        return { reviews: page.items, page_info: page.page_info };
      }
    case "list_location_reviews":
      {
        const locationId = requiredString(args, "location_id");
        const reviews = await listLocationReviews(
          site.db,
          site.organizationId,
          locationId,
        );
        const page = paginateMcpCollection(reviews, args, { resource: `location-reviews:${site.organizationId}:${locationId}` });
        return { reviews: page.items, page_info: page.page_info };
      }
    default:
      return NOT_HANDLED
  }
}
