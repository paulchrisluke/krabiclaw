import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getAuthSession } from "~/server/utils/auth";
import { queryFirst } from "~/server/db";
import { getPlatformBlogPost } from "~/server/utils/platform-content";
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

  const env = cloudflareEnv(event);
  const db = env.DB;

  if (!db) {
    return jsonResponse(
      { error: "Database not available" },
      { status: 500 },
    );
  }

  const session = await getAuthSession(event, env);

  if (!session?.user?.id) {
    return jsonResponse(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const site = await queryFirst<{
      id: string;
      organization_id: string;
    }>(
      db,
      `
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member m ON o.id = m.organizationId
      WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor')
      LIMIT 1
    `,
      [siteId, session.user.id],
    );

    if (!site) {
      return jsonResponse(
        { error: "Site not found or access denied" },
        { status: 404 },
      );
    }

    const post = await getPlatformBlogPost(db, postId, siteId);

    return jsonResponse({ post });
  } catch (error) {
    console.error("Failed to get blog post:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to get blog post");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
