import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { updatePlatformBlogPost } from "~/server/utils/platform-content";
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
    const { db } = await requireBlogAccess(event, siteId);

    const result = await updatePlatformBlogPost(db, postId, { unpublish: true }, siteId);

    return jsonResponse({ success: true, post: result.post });
  } catch (error) {
    console.error("Failed to unpublish blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to unpublish blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
