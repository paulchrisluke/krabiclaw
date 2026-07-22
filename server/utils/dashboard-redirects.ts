import { queryFirst, type DbClient } from '~/server/db'

export interface DashboardSiteRouteContext {
  organizationSlug: string
  siteSlug: string
}

export async function getDashboardSiteRouteContext(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<DashboardSiteRouteContext | null> {
  const context = await queryFirst<{ organization_slug: string | null; site_slug: string | null }>(db, `
    SELECT o.slug AS organization_slug, s.subdomain AS site_slug
    FROM organization o
    JOIN sites s ON s.organization_id = o.id
    WHERE o.id = ? AND s.id = ?
    LIMIT 1
  `, [organizationId, siteId])

  if (!context?.organization_slug || !context.site_slug) return null
  return {
    organizationSlug: context.organization_slug,
    siteSlug: context.site_slug,
  }
}
