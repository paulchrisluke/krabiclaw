
import type { H3Event } from 'nitro'
import { queryAll } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { parsePostalAddress } from '~/utils/postal-address'

export interface DashboardLocationResource {
  id: string
  slug: string
  title: string
  status: string
  address: string | null | Record<string, unknown>
  phone: string | null
  email: string | null
}

export async function listDashboardLocationsResource(
  event: H3Event,
  scope: { organizationSlug?: string } = {},
) {
  const { db, organization } = await getDashboardContext(event, {
    organizationSlug: scope.organizationSlug,
  })
  const locations = await queryAll<DashboardLocationResource>(db, `
    SELECT id, slug, title, status, address, phone, email
      FROM business_locations
     WHERE organization_id = ?
     ORDER BY title ASC
  `, [organization.id])
  return {
    success: true as const,
    locations: locations.map(location => ({
      ...location,
      address: parsePostalAddress(location.address),
    })),
  }
}
