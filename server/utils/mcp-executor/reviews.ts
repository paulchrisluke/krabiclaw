import type { McpExecutorContext } from './shared'
import { listLocationReviews } from '~/server/utils/mcp-workflows'
import { replyToReview } from '~/server/utils/review-management'
import { createOwnerEnteredSiteReview, deleteOwnerEnteredSiteReview, listSiteReviews, updateOwnerEnteredSiteReview } from '~/server/utils/site-reviews'
import { NOT_HANDLED, assertDomainSuccess, mutationContextPayload, omit, requiredString } from './shared'

export async function handleReviewsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_site_reviews":
      return { reviews: await listSiteReviews(site.db, site.siteId) };
    case "create_owner_entered_site_review": {
      const result = await createOwnerEnteredSiteReview(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
        enteredByUserId: site.userId,
      }, args as never);
      return { ...result, context: await mutationContextPayload(site) };
    }
    case "update_owner_entered_site_review": {
      const reviewId = requiredString(args, "review_id");
      const result = await updateOwnerEnteredSiteReview(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
      }, reviewId, omit(args, ["review_id"]));
      return { ...result, context: await mutationContextPayload(site) };
    }
    case "delete_owner_entered_site_review": {
      const result = await deleteOwnerEnteredSiteReview(site.db, {
        organizationId: site.organizationId,
        siteId: site.siteId,
      }, requiredString(args, "review_id"));
      return { ...result, context: await mutationContextPayload(site) };
    }
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
