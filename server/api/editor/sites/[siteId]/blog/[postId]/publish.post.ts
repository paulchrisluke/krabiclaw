import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { updatePlatformBlogPost, getPlatformBlogPost } from "~/server/utils/platform-content";
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

    await updatePlatformBlogPost(db, postId, { publish: true }, siteId);
    const post = await getPlatformBlogPost(db, postId, siteId);

    return jsonResponse({ success: true, post });
  } catch (error) {
    console.error("Failed to publish blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to publish blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
