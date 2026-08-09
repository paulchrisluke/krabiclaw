import { queryAll } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

interface OrganizationRow { id: string; name: string; slug: string | null; impersonation_user_id: string | null }
interface SiteRow { id: string; organization_id: string; slug: string; brand_name: string | null; subdomain: string | null; status: string | null }
interface LocationRow { id: string; site_id: string; slug: string; title: string; city: string | null; is_primary: number }

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['organizations'] })

    const [organizationRows, siteRows, locationRows] = await Promise.all([
      queryAll<OrganizationRow>(db, `
        WITH workspace_member AS (
          SELECT organizationId, userId,
            ROW_NUMBER() OVER (PARTITION BY organizationId ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, createdAt ASC) AS rn
          FROM member
          WHERE role IN ('owner', 'admin')
        )
        SELECT o.id, o.name, o.slug, wm.userId AS impersonation_user_id
        FROM organization o
        LEFT JOIN workspace_member wm ON wm.organizationId = o.id AND wm.rn = 1
        ORDER BY o.name ASC
      `),
      queryAll<SiteRow>(db, `
        SELECT id, organization_id, slug, brand_name, subdomain, status
        FROM sites
        ORDER BY COALESCE(brand_name, slug) ASC
      `),
      queryAll<LocationRow>(db, `
        SELECT id, site_id, slug, title, city, is_primary
        FROM business_locations
        ORDER BY is_primary DESC, title ASC
      `),
    ])

    const locationsBySite = new Map<string, LocationRow[]>()
    for (const location of locationRows) locationsBySite.set(location.site_id, [...(locationsBySite.get(location.site_id) || []), location])

    const sitesByOrganization = new Map<string, SiteRow[]>()
    for (const site of siteRows) sitesByOrganization.set(site.organization_id, [...(sitesByOrganization.get(site.organization_id) || []), site])

    return jsonResponse({
      organizations: organizationRows.map(organization => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        impersonationUserId: organization.impersonation_user_id,
        sites: (sitesByOrganization.get(organization.id) || []).map(site => ({
          id: site.id,
          slug: site.slug,
          name: site.brand_name || site.slug,
          subdomain: site.subdomain,
          status: site.status,
          locations: (locationsBySite.get(site.id) || []).map(location => ({
            id: location.id,
            slug: location.slug,
            title: location.title,
            city: location.city,
            isPrimary: Boolean(location.is_primary),
          })),
        })),
      })),
    })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to load organizations')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
