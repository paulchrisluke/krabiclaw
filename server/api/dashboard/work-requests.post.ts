// POST /api/dashboard/work-requests — managed client submits a work request
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getDashboardContext } from "~/server/utils/dashboard-context";
import { createWorkRequest } from "~/server/utils/work-request-management";

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);
  const { db, organization, site } = await getDashboardContext(event, {
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

  return jsonResponse(result.data, { status: result.status });
});
