import { jsonResponse } from "~/server/utils/api-response";
import { deletePlatformBlogPost } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";
import { requireSiteAccess } from "~/server/utils/location-access";

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const postId = getRouterParam(event, "postId");

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      { error: "Site ID is required" }, { status: 400 }, );
  }

  if (!postId || Array.isArray(postId)) {
    return jsonResponse(
      { error: "Post ID is required" }, { status: 400 }, );
  }

  try {
    const { db } = await requireSiteAccess(event, siteId);

    await deletePlatformBlogPost(db, postId, siteId);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Failed to delete blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to delete blog post");
    return jsonResponse(
      { error: message }, { status: statusCode }, );
  }
});
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
