import type { McpExecutorContext } from './shared'
import { listLocationReviews } from '~/server/utils/mcp-workflows'
import { replyToReview } from '~/server/utils/review-management'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, requiredString } from './shared'

export async function handleReviewsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "list_location_reviews":
      return {
        reviews: await listLocationReviews(
          site.db,
          site.siteId,
          requiredString(args, "location_id"),
        ),
      };
    case "reply_to_review": {
      const reply =
        args.reply === null ? null : requiredString(args, "reply");
      const result = await replyToReview(
        site.db,
        site.organizationId,
        site.siteId,
        requiredString(args, "review_id"),
        reply,
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
