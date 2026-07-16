import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getAuthSession } from "~/server/utils/auth";
import { queryFirst } from "~/server/db";
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
