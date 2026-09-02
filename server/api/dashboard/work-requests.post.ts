// POST /api/dashboard/work-requests — Growth client submits a priority-support request
import { jsonResponse } from "~/server/utils/api-response";
import { getDashboardContext } from "~/server/utils/dashboard-context";
import { createWorkRequest } from "~/server/utils/work-request-management";
import { fireOrganizationEventSafe } from "~/server/utils/organization-events";

export default defineHandler(async (event) => {
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false, });

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
  const source = body.source === "whatsapp" ? "whatsapp" : "dashboard";
  const result = await createWorkRequest(db, organization.id, site?.id ?? null, {
    type, title: title ?? "", description, priority: body.priority, source, });

  if (result.status === 201 && "id" in result.data) {
    await fireOrganizationEventSafe({
      db, organizationId: organization.id, siteId: site?.id ?? null, actorId: userId, eventType: "work_request.created", entityType: "work_request", entityId: result.data.id, metadata: { type, priority: body.priority ?? "normal", source }, });
  }

  return jsonResponse(result.data, { status: result.status });
});
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
