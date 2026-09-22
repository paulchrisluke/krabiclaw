import type { H3Event } from 'nitro'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export async function requireTenantPageWriteAccess(event: H3Event, organizationId: string) {
  // Site-wide access, asserted once. This used to ask for context access and then
  // for site-wide access, which is two reads of the same member row for one
  // answer: site-wide is the stricter of the two — context passes on the site's
  // team *or* any of its locations' teams, site-wide requires the site's team —
  // so anything the context check would refuse, this refuses too, with the same
  // 404.
  const { env, db, organization, session } = await requireOrganizationAccess(event, organizationId)
  return { env, db, site, userId: session.user.id }
}
