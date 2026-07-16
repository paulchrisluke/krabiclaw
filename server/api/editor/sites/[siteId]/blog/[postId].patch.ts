import { jsonResponse } from "~/server/utils/api-response";
import { requireSiteAccess } from "~/server/utils/location-access";
import { assertMemberScope } from "~/server/utils/member-access";
import { updatePlatformBlogPost, getPlatformBlogPost, type PlatformBlogUpdateInput } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const postId = getRouterParam(event, "postId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      { error: "Site ID is required" },
      { status: 400 },
    );
  }

  if (!postId || Array.isArray(postId)) {
    return jsonResponse(
      { error: "Post ID is required" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(
      { error: "Request body must be a valid object" },
      { status: 400 },
    );
  }

  try {
    const { db, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager']);
    await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId });

    await updatePlatformBlogPost(db, postId, body as PlatformBlogUpdateInput, siteId);
    const post = await getPlatformBlogPost(db, postId, siteId);

    return jsonResponse({ success: true, post });
  } catch (error) {
    console.error("Failed to update blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to update blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
