import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { createPlatformBlogPost, type PlatformBlogCreateInput } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";
import { finalizeRequestMetrics } from "~/server/utils/request-metrics";

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      { error: "Site ID is required" }, { status: 400 }, );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(
      { error: "Request body must be a valid object" }, { status: 400 }, );
  }

  try {
    const { env, db, session, site } = await requireBlogAccess(event, siteId);

    const result = await createPlatformBlogPost(db, session.user.id, body as PlatformBlogCreateInput, {
      site_id: siteId, organization_id: site.organization_id, }, env);

    return jsonResponse(finalizeRequestMetrics(event, 'editor-blog-post-create', result));
  } catch (error) {
    console.error("Failed to create blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to create blog post");
    return jsonResponse(
      { error: message }, { status: statusCode }, );
  }
});
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
