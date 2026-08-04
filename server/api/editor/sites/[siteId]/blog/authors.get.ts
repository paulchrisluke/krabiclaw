import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { listSiteAuthors } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse({ error: "Site ID is required" }, { status: 400 });
  }

  try {
    const { db } = await requireBlogAccess(event, siteId);
    const authors = await listSiteAuthors(db, siteId);
    return jsonResponse({ authors });
  } catch (error) {
    console.error("Failed to list blog authors:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to list blog authors");
    return jsonResponse({ error: message }, { status: statusCode });
  }
});
