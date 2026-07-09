// POST /api/dashboard/work-requests — managed client submits a work request
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getDashboardContext } from "~/server/utils/dashboard-context";
import { createWorkRequest } from "~/server/utils/work-request-management";
import { fireSiteEventSafe, resolvePrimarySiteForEvent } from "~/server/utils/site-events";

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false,
  });

  const body = (await readBody(event).catch(() => ({}))) as {
    type?: string;
    title?: string;
    description?: string;
    priority?: string;
    source?: string;
  };

  const type = body.type ?? "";
  const title = body.title?.trim();
  const description = body.description?.trim() || null;
  const source =
    body.source === "chowbot"
      ? "chowbot"
      : body.source === "whatsapp"
        ? "whatsapp"
        : "dashboard";
  const result = await createWorkRequest(env, db, organization.id, site?.id ?? null, {
    type,
    title: title ?? "",
    description,
    priority: body.priority,
    source,
  });

  if (result.status === 201 && "id" in result.data) {
    const eventSiteId = site?.id ?? (await resolvePrimarySiteForEvent(db, organization.id));
    if (eventSiteId) {
      await fireSiteEventSafe({
        db,
        organizationId: organization.id,
        siteId: eventSiteId,
        actorId: userId,
        eventType: "work_request.created",
        entityType: "work_request",
        entityId: result.data.id,
        metadata: { type, priority: body.priority ?? "normal", source },
      });
    }
  }

  return jsonResponse(result.data, { status: result.status });
});
