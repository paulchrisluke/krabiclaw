import { jsonResponse } from "~/server/utils/api-response";
import { loadDashboardBlogPosts } from '~/server/utils/dashboard-editor-resources'
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, "organizationId");
  const status = getQuery(event).status as string | undefined;

  if (!organizationId || Array.isArray(organizationId)) {
    return jsonResponse(
      { error: "Site ID is required" }, { status: 400 }, );
  }

  try {
    return jsonResponse(await loadDashboardBlogPosts(event, organizationId, status));
  } catch (error) {
    console.error("Failed to list blog posts:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to list blog posts");
    return jsonResponse(
      { error: message }, { status: statusCode }, );
  }
});
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
