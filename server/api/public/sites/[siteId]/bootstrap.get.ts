import { jsonResponse } from "~/server/utils/api-response";
import { handlePublicBootstrap } from "~/server/utils/public-bootstrap";

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  if (!siteId)
    return jsonResponse({ error: "siteId required" }, { status: 400 });
  const query = getQuery(event);
  return await handlePublicBootstrap(
    event,
    siteId,
    Object.fromEntries(
      Object.entries(query).map(([key, value]) => [
        key,
        typeof value === "string" ? value : undefined,
      ]),
    ),
  );
});
