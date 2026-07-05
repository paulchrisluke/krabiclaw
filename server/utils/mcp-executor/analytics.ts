import type { McpExecutorContext } from './shared'
import { aggregateAnalyticsForRange } from '~/server/utils/analytics'
import { createError } from 'h3'
import { queryAll } from '~/server/db'
import { NOT_HANDLED, getDateString, optionalString } from './shared'

export async function handleAnalyticsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site, event, normalizedArguments, rawArguments, siteId, tool } = ctx
  switch (toolName) {
    case "get_site_analytics": {
      const startDate =
        optionalString(args, "start_date") ??
        getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const endDate =
        optionalString(args, "end_date") ?? getDateString(new Date());
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ) {
        throw createError({
          statusCode: 400,
          statusMessage: "Dates must be YYYY-MM-DD format",
        });
      }
      const MAX_ANALYTICS_DAYS = 365;
      const daySpan = Math.ceil(
        (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime())
          / (1000 * 60 * 60 * 24),
      );
      if (daySpan > MAX_ANALYTICS_DAYS) {
        throw createError({
          statusCode: 400,
          statusMessage: `Date range exceeds maximum of ${MAX_ANALYTICS_DAYS} days (requested: ${daySpan} days)`,
        });
      }
      await aggregateAnalyticsForRange(site.db, site.siteId, startDate, endDate);
      const rows = await queryAll<Record<string, unknown>>(
        site.db,
        `
        SELECT date, page_views, unique_sessions, COALESCE(avg_session_duration, 0) as avg_session_duration, top_pages
        FROM site_analytics_daily
        WHERE site_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
      `,
        [site.siteId, startDate, endDate],
      );
      const toNum = (v: unknown) =>
        typeof v === "number" ? v : Number(v || 0);
      const summary = rows.reduce<{
        pageViews: number;
        sessions: number;
        totalDuration: number;
      }>(
        (acc, row) => ({
          pageViews: acc.pageViews + toNum(row.page_views),
          sessions: acc.sessions + toNum(row.unique_sessions),
          totalDuration:
            acc.totalDuration +
            toNum(row.avg_session_duration) * toNum(row.unique_sessions),
        }),
        { pageViews: 0, sessions: 0, totalDuration: 0 },
      );
      const avgSessionDuration =
        summary.sessions > 0
          ? Math.round(summary.totalDuration / summary.sessions)
          : 0;
      const topPageMap = new Map<string, number>();
      for (const row of rows) {
        if (!row.top_pages) continue;
        try {
          const parsed = JSON.parse(String(row.top_pages));
          if (!Array.isArray(parsed)) continue;
          for (const page of parsed as Record<string, unknown>[]) {
            const path =
              String(page.path ?? page.pagePath ?? "/").trim() || "/";
            const views = toNum(page.views ?? page.count);
            if (views > 0)
              topPageMap.set(path, (topPageMap.get(path) ?? 0) + views);
          }
        } catch {
          /* skip malformed rows */
        }
      }
      const topPages = Array.from(topPageMap.entries())
        .map(([path, views]) => ({
          path,
          views,
          percentOfTotal:
            summary.pageViews > 0
              ? Math.round((views / summary.pageViews) * 100)
              : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);
      return {
        metrics: {
          pageViews: summary.pageViews,
          uniqueSessions: summary.sessions,
          avgSessionDuration,
        },
        topPages,
        period: { startDate, endDate },
      };
    }
    default:
      return NOT_HANDLED
  }
}
