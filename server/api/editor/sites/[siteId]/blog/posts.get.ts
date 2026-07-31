import { jsonResponse } from "~/server/utils/api-response";
import { loadDashboardBlogPosts } from '~/server/utils/dashboard-editor-resources'
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
    return jsonResponse(await loadDashboardBlogPosts(event, siteId, status));
  } catch (error) {
    console.error("Failed to list blog posts:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to list blog posts");
    return jsonResponse(
      { error: message },
      { status: statusCode },
    );
  }
});
