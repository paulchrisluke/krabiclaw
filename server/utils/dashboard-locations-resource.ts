import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'

export interface DashboardLocationResource {
  id: string
  slug: string
  title: string
  city: string | null
  is_primary: boolean
  status: string
  address: string | null | Record<string, unknown>
  phone: string | null
  email: string | null
  notification_phone: string | null
  grab_url: string | null
  uber_eats_url: string | null
  foodpanda_url: string | null
}

export async function listDashboardLocationsResource(
  event: H3Event,
  scope: { organizationSlug?: string; siteSlug?: string } = {},
) {
  const { db, organization, site } = await getDashboardContext(event, {
    requireSite: true,
    organizationSlug: scope.organizationSlug,
    siteSlug: scope.siteSlug,
  })
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  const scoped = !isOrganizationWideRole(organization.role)
  const locations = await queryAll<DashboardLocationResource>(db, `
    SELECT id, slug, title, city, is_primary, status, address, phone, email,
           notification_phone, grab_url, uber_eats_url, foodpanda_url
      FROM business_locations
     WHERE organization_id = ? AND site_id = ?
       ${scoped ? `AND EXISTS (
         SELECT 1
           FROM member m
           JOIN sites s ON s.id = business_locations.site_id
           JOIN teamMember tm ON tm.userId = m.userId
            AND tm.teamId IN (s.team_id, business_locations.team_id)
          WHERE m.id = ? AND m.organizationId = business_locations.organization_id
       )` : ''}
     ORDER BY is_primary DESC, title ASC
  `, scoped
    ? [organization.id, site.id, organization.memberId]
    : [organization.id, site.id])
  return {
    success: true as const,
    locations: locations.map(location => ({
      ...location,
      address: typeof location.address === 'string'
        ? (() => {
            try {
              return JSON.parse(location.address) as Record<string, unknown>
            } catch {
              return null
            }
          })()
        : location.address,
      is_primary: Boolean(location.is_primary),
    })),
  }
}
