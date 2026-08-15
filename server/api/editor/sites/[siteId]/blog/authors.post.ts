import { jsonResponse } from "~/server/utils/api-response";
import { requireBlogAccess } from "~/server/utils/blog-access";
import { createSiteAuthor, type SiteAuthorInput } from "~/server/utils/platform-content";
import { httpErrorDetails } from "~/server/utils/http-error";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse({ error: "Site ID is required" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a valid object" }, { status: 400 });
  }

  try {
    const { db, site } = await requireBlogAccess(event, siteId);
    const result = await createSiteAuthor(db, { site_id: siteId, organization_id: site.organization_id }, body as SiteAuthorInput);
    return jsonResponse(result);
  } catch (error) {
    console.error("Failed to create blog author:", error);
    const { message, statusCode } = httpErrorDetails(error, "Failed to create blog author");
    return jsonResponse({ error: message }, { status: statusCode });
  }
});
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
import { readBody } from 'h3'
