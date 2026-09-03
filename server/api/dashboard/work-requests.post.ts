// POST /api/dashboard/work-requests — Growth client submits a priority-support request
import { jsonResponse } from "~/server/utils/api-response";
import { getDashboardContext } from "~/server/utils/dashboard-context";
import { createWorkRequest } from "~/server/utils/work-request-management";
import { fireOrganizationEventSafe } from "~/server/utils/organization-events";

export default defineHandler(async (event) => {
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false, });

  const body = await readBody(event) as {
    type?: unknown;
    title?: unknown;
    description?: unknown;
    priority?: unknown;
  };
  if (typeof body.type !== "string" || typeof body.title !== "string") {
    return jsonResponse({ error: "type and title are required strings" }, { status: 400 });
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    return jsonResponse({ error: "description must be a string" }, { status: 400 });
  }
  if (body.priority !== undefined && typeof body.priority !== "string") {
    return jsonResponse({ error: "priority must be a string" }, { status: 400 });
  }

  const type = body.type;
  const title = body.title.trim();
  const description = body.description?.trim() || null;
  const priority = body.priority ?? "normal";
  // This endpoint only serves the dashboard's own support form — source is
  // never client-controlled, unlike the removed request contract that let a
  // caller claim "whatsapp" for a request that never went through WhatsApp.
  const source = "dashboard" as const;
  const result = await createWorkRequest(db, organization.id, site?.id ?? null, {
    type, title, description, priority, source, });

  if (result.status === 201 && "id" in result.data) {
    await fireOrganizationEventSafe({
    db, organizationId: organization.id, siteId: site?.id ?? null, actorId: userId, eventType: "work_request.created", entityType: "work_request", entityId: result.data.id, metadata: { type, priority, source }, });
  }

  return jsonResponse(result.data, { status: result.status });
});
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
