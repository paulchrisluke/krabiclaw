import { jsonResponse } from "~/server/utils/api-response";
import { requireSiteAccess } from "~/server/utils/location-access";
import { assertMemberScope } from "~/server/utils/member-access";
import { listPlatformBlogPosts } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const status = getQuery(event).status as string | undefined;

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      { error: "Site ID is required" },
      { status: 400 },
    );
  }

  try {
    const { db, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager']);
    await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId });

    const posts = await listPlatformBlogPosts(db, status, siteId);

    return jsonResponse({ posts });
  } catch (error) {
    console.error("Failed to list blog posts:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to list blog posts");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
