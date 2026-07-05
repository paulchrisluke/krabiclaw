// GET /api/admin/mcp-usage — platform admin views ChatGPT MCP tool call telemetry
import { cloudflareEnv, jsonResponse } from "~/server/utils/api-response";
import { getAuthSession } from "~/server/utils/auth";
import { isPlatformAdmin } from "~/server/utils/platform-auth";
import { queryAll } from "~/server/db";

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event);
  const db = env.DB;
  if (!db)
    return jsonResponse({ error: "Database not available" }, { status: 500 });

  const session = await getAuthSession(event, env);
  if (!session?.user?.email)
    return jsonResponse({ error: "Authentication required" }, { status: 401 });
  if (!isPlatformAdmin(session.user, env))
    return jsonResponse(
      { error: "Platform admin access required" },
      { status: 403 },
    );

  const query = getQuery(event);
  const days = Math.min(Math.max(Number(query.days) || 7, 1), 90);
  const siteId = query.site_id ? String(query.site_id) : null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const siteFilter = siteId ? "AND e.site_id = ?" : "";
  const siteParam = siteId ? [siteId] : [];

  const [topTools, failuresByTool, blockedTools, bySite, recentErrors] = await Promise.all([
    queryAll(db, `
      SELECT tool_name, tool_domain, COUNT(*) AS calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
        ROUND(AVG(duration_ms), 0) AS avg_duration_ms
      FROM mcp_tool_call_events e
      WHERE method = 'tools/call' AND created_at >= ? ${siteFilter}
      GROUP BY tool_name, tool_domain
      ORDER BY calls DESC
      LIMIT 50
    `, [since, ...siteParam]),

    queryAll(db, `
      SELECT tool_name, error_code, error_message, COUNT(*) AS occurrences,
        MAX(created_at) AS last_seen
      FROM mcp_tool_call_events e
      WHERE method = 'tools/call' AND status = 'error' AND created_at >= ? ${siteFilter}
      GROUP BY tool_name, error_code, error_message
      ORDER BY occurrences DESC
      LIMIT 50
    `, [since, ...siteParam]),

    queryAll(db, `
      SELECT tool_name, COUNT(*) AS occurrences, MAX(created_at) AS last_seen
      FROM mcp_tool_call_events e
      WHERE method = 'tools/call' AND status IN ('blocked', 'auth_required')
        AND created_at >= ? ${siteFilter}
      GROUP BY tool_name
      ORDER BY occurrences DESC
      LIMIT 50
    `, [since, ...siteParam]),

    queryAll(db, `
      SELECT e.site_id, s.brand_name, s.subdomain, o.name AS org_name,
        COUNT(*) AS calls,
        SUM(CASE WHEN e.status = 'error' THEN 1 ELSE 0 END) AS errors
      FROM mcp_tool_call_events e
      LEFT JOIN sites s ON s.id = e.site_id
      LEFT JOIN organization o ON o.id = s.organization_id
      WHERE e.method = 'tools/call' AND e.created_at >= ? AND e.site_id IS NOT NULL ${siteFilter}
      GROUP BY e.site_id
      ORDER BY calls DESC
      LIMIT 50
    `, [since, ...siteParam]),

    queryAll(db, `
      SELECT id, tool_name, tool_domain, status, error_code, error_message,
        site_id, user_id, duration_ms, created_at
      FROM mcp_tool_call_events e
      WHERE method = 'tools/call' AND status != 'success' AND created_at >= ? ${siteFilter}
      ORDER BY created_at DESC
      LIMIT 50
    `, [since, ...siteParam]),
  ]);

  return jsonResponse({
    range_days: days,
    site_id: siteId,
    top_tools: topTools ?? [],
    failures_by_tool: failuresByTool ?? [],
    blocked_or_auth_required: blockedTools ?? [],
    by_site: bySite ?? [],
    recent_errors: recentErrors ?? [],
  });
});
