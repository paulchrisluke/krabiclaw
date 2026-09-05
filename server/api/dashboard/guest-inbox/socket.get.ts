import { HTTPError, defineHandler } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOperationalRole, isOrganizationWideRole, listResourceTeamAccess } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const { env, db, organization, userId } = await getDashboardContext(event, { requireSite: false })
  if (!isOperationalRole(organization.role)) {
    throw new HTTPError({ statusCode: 403, message: 'Dashboard realtime access denied' })
  }

  const namespace = env.GUEST_INBOX_HUBS
  if (!namespace) throw new HTTPError({ statusCode: 503, message: 'Dashboard realtime binding is not configured' })

  const organizationWide = isOrganizationWideRole(organization.role)
  const resourceAccess = organizationWide
    ? []
    : await listResourceTeamAccess(db, { env, memberId: organization.memberId })
  const allowedSiteIds = resourceAccess
    .filter(access => access.locationId === null)
    .map(access => access.siteId)
  const allowedLocationIds = resourceAccess
    .flatMap(access => access.locationId ? [access.locationId] : [])

  const headers = new Headers(event.req.headers)
  headers.set('x-krabiclaw-organization-id', organization.id)
  headers.set('x-krabiclaw-user-id', userId)
  headers.set('x-krabiclaw-allowed-site-ids', organizationWide ? '*' : JSON.stringify(allowedSiteIds))
  headers.set('x-krabiclaw-allowed-location-ids', JSON.stringify(allowedLocationIds))

  return await namespace.get(namespace.idFromName(organization.id)).fetch(new Request(event.req.url, {
    method: event.req.method,
    headers,
  }))
})
