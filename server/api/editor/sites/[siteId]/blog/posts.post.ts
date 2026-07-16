import { jsonResponse } from "~/server/utils/api-response";
import { requireSiteAccess } from "~/server/utils/location-access";
import { assertMemberScope } from "~/server/utils/member-access";
import { createPlatformBlogPost, type PlatformBlogCreateInput } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      { error: "Site ID is required" },
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
    const { db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager']);
    await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId });

    const result = await createPlatformBlogPost(db, session.user.id, body as PlatformBlogCreateInput, {
      site_id: siteId,
      organization_id: site.organization_id,
    });

    return jsonResponse(result);
  } catch (error) {
    console.error("Failed to create blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to create blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
