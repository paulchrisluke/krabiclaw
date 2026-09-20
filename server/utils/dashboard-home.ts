import { queryFirst, type DbClient } from '~/server/db'
import { listTenantPages } from '~/server/utils/content/pages'

export interface DashboardHomeData {
  pages: Awaited<ReturnType<typeof listTenantPages>>
  /** What the site-wide cards state: published articles, site questions, site reviews. */
  counts: { blog: number; qa: number; reviews: number }
}

/** The site hub's payload: its pages and the counts its cards state. The locations tab reads the dashboard context. */
export async function getDashboardHomeData(db: DbClient, siteId: string): Promise<DashboardHomeData> {
  const [pages, counts] = await Promise.all([
    listTenantPages(db, siteId),
    // Positional placeholders repeated per subquery: D1 binds each `?` in order.
    queryFirst<{ blog: number; qa: number; reviews: number }>(db, `
      SELECT
        (SELECT COUNT(*) FROM content_documents WHERE kind = 'article' AND row_role = 'root' AND site_id = ? AND status = 'published') AS blog,
        (SELECT COUNT(*) FROM content_documents WHERE kind = 'qa' AND row_role = 'root' AND site_id = ? AND location_id IS NULL) AS qa,
        (SELECT COUNT(*) FROM reviews WHERE site_id = ? AND location_id IS NULL) AS reviews
    `, [siteId, siteId, siteId]),
  ])

  return {
    pages,
    counts: { blog: counts?.blog ?? 0, qa: counts?.qa ?? 0, reviews: counts?.reviews ?? 0 },
  }
}
