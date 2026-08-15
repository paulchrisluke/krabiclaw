import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { parsePlatformBlogLifecycleInput, updatePlatformBlogLifecycle } from "~/server/utils/platform-content";
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
    const input = parsePlatformBlogLifecycleInput(await readBody(event) as unknown, "publish");
    const lifecycle = await updatePlatformBlogLifecycle(db, postId, input, siteId);

    return jsonResponse({ success: true, lifecycle });
  } catch (error) {
    console.error("Failed to publish blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to publish blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
import { readBody } from 'h3'
