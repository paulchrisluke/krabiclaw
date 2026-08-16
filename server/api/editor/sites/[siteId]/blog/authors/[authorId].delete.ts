import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { deleteSiteAuthor } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const authorId = getRouterParam(event, "authorId");

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse({ error: "Site ID is required" }, { status: 400 });
  }

  if (!authorId || Array.isArray(authorId)) {
    return jsonResponse({ error: "Author ID is required" }, { status: 400 });
  }

  try {
    const { db } = await requireBlogAccess(event, siteId);
    const result = await deleteSiteAuthor(db, siteId, authorId);
    return jsonResponse(result);
  } catch (error) {
    console.error("Failed to delete blog author:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to delete blog author");
    return jsonResponse({ error: message }, { status: statusCode });
  }
});
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
