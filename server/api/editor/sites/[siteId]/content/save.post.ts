// POST save content directly
import { cloudflareEnv, jsonResponse } from "../../../../../utils/api-response";
import { getAuthSession } from "~/server/utils/auth";
import { updatePageContent } from "~/server/utils/mcp-workflows";
import { assertResourceAccess } from "~/server/utils/member-access";
import { queryFirst } from "~/server/db";

interface SaveRequest {
  page: string;
  changes: Record<string, string>;
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, "siteId");
  const body = await readBody(event);

  if (!siteId || Array.isArray(siteId)) {
    return jsonResponse(
      {
        error: "Site ID is required",
      },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(
      {
        error: "Request body must be a valid object",
      },
      { status: 400 },
    );
  }

  const { page, changes } = body as Partial<SaveRequest>;

  if (typeof page !== "string" || !page.trim()) {
    return jsonResponse(
      {
        error: "page is required and must be a string",
      },
      { status: 400 },
    );
  }

  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    return jsonResponse(
      {
        error: "changes is required and must be an object",
      },
      { status: 400 },
    );
  }

  const env = cloudflareEnv(event);
  const db = env.DB;

  if (!db) {
    return jsonResponse(
      {
        error: "Database not available",
      },
      { status: 500 },
    );
  }

  const session = await getAuthSession(event, env);

  if (!session?.user?.id) {
    return jsonResponse(
      {
        error: "Authentication required",
      },
      { status: 401 },
    );
  }

  try {
    const site = await queryFirst<{
      id: string;
      organization_id: string;
      status: string;
      onboarding_status: string | null;
      member_id: string;
      member_role: string;
    }>(
      db,
      `
      SELECT s.id, s.organization_id, s.status, s.onboarding_status, om.id AS member_id, om.role AS member_role
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `,
      [siteId, session.user.id],
    );

    if (!site) {
      return jsonResponse(
        {
          error: "Site not found or access denied",
        },
        { status: 404 },
      );
    }

    const locationId = (getQuery(event).locationId as string) || undefined;

    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId ?? null,
    });

    const result = await updatePageContent(db, site.organization_id, siteId, {
      page,
      changes,
      location_id: locationId,
    });

    return jsonResponse({
      success: true,
      message: "Content saved successfully",
      changesCount: result.changes_count,
    });
  } catch (error) {
    console.error("Failed to save content:", error);
    const statusCode = Number((error as { statusCode?: number }).statusCode) || 500;
    const statusMessage = (error as { statusMessage?: string }).statusMessage;
    return jsonResponse(
      {
        error: statusMessage || "Failed to save content",
      },
      { status: statusCode },
    );
  }
});
