import { jsonResponse } from "~/server/utils/api-response";
import { loadDashboardBlogPost } from '~/server/utils/dashboard-editor-resources'
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const postId = getRouterParam(event, "postId");

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

  try {
    return jsonResponse(await loadDashboardBlogPost(event, siteId, postId));
  } catch (error) {
    console.error("Failed to get blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to get blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
