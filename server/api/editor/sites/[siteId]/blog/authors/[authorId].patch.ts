import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { updateSiteAuthor, type SiteAuthorUpdateInput } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const authorId = getRouterParam(event, "authorId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse({ error: "Site ID is required" }, { status: 400 });
  }

  if (!authorId || Array.isArray(authorId)) {
    return jsonResponse({ error: "Author ID is required" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a valid object" }, { status: 400 });
  }

  try {
    const { db } = await requireBlogAccess(event, siteId);
    const result = await updateSiteAuthor(db, siteId, authorId, body as SiteAuthorUpdateInput);
    return jsonResponse(result);
  } catch (error) {
    console.error("Failed to update blog author:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to update blog author");
    return jsonResponse({ error: message }, { status: statusCode });
  }
});
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
import { readBody } from 'h3'
