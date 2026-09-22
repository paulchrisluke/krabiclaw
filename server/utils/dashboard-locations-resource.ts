import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { listAccessibleLocationIds, memberAccessPrincipal } from '~/server/utils/member-access'
import { parsePostalAddress } from '~/utils/postal-address'

export interface DashboardLocationResource {
  id: string
  slug: string
  title: string
  team_id: string | null
  status: string
  address: string | null | Record<string, unknown>
  phone: string | null
  email: string | null
  notification_phone: string | null
}

export async function listDashboardLocationsResource(
  event: H3Event,
  scope: { organizationSlug?: string } = {},
) {
  const { env, db, organization } = await getDashboardContext(event, {
    organizationSlug: scope.organizationSlug,
  })
  const accessibleLocationIds = await listAccessibleLocationIds(db, memberAccessPrincipal(organization, { env, event }))
  if (accessibleLocationIds?.length === 0) return { success: true as const, locations: [] }
  const locationFilter = accessibleLocationIds
    ? `AND id IN (SELECT value FROM json_each(?))`
    : ''
  const locations = await queryAll<DashboardLocationResource>(db, `
    SELECT id, slug, title, team_id, status, address, phone, email,
           notification_phone
      FROM business_locations
     WHERE organization_id = ?
       ${locationFilter}
     ORDER BY title ASC
  `, [organization.id, ...(accessibleLocationIds ? [d1JsonStringSet(accessibleLocationIds)] : [])])
  return {
    success: true as const,
    locations: locations.map(location => ({
      ...location,
      address: parsePostalAddress(location.address),
    })),
  }
}
