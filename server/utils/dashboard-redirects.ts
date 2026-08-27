import { queryFirst, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { resolveUserOrganization } from '~/server/utils/member-access'

export interface DashboardSiteRouteContext {
  organizationSlug: string
  siteSlug: string
}

export async function getDashboardSiteRouteContext(
  db: DbClient,
  env: CloudflareEnv,
  userId: string,
  organizationId: string,
  siteId: string,
): Promise<DashboardSiteRouteContext | null> {
  const [organization, site] = await Promise.all([
    resolveUserOrganization(env, { userId, organizationId }),
    queryFirst<{ site_slug: string | null }>(db, `
    SELECT subdomain AS site_slug
    FROM sites
    WHERE organization_id = ? AND id = ?
    LIMIT 1
  `, [organizationId, siteId]),
  ])

  if (!organization || !site?.site_slug) return null
  return {
    organizationSlug: organization.slug,
    siteSlug: site.site_slug,
  }
}
