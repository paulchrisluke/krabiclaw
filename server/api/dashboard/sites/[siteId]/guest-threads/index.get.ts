import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listGuestThreads, type GuestThreadInboxStatus, type GuestThreadSubmissionType } from '~/server/utils/guest-threads'
import { assertMemberScope } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id.trim() ? query.location_id.trim() : null
  await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId })
  const search = typeof query.search === 'string' ? query.search : null
  const type = query.type === 'contact' || query.type === 'reservation' || query.type === 'experience_booking'
    ? query.type as GuestThreadSubmissionType
    : null
  const inboxStatus = query.inbox_status === 'open' || query.inbox_status === 'waiting_on_owner' || query.inbox_status === 'waiting_on_guest' || query.inbox_status === 'closed'
    ? query.inbox_status as GuestThreadInboxStatus
    : null
  const unreadOnly = query.unread === '1' || query.unread === 'true'

  const threads = await listGuestThreads(db, siteId, {
    locationId,
    search,
    type,
    inboxStatus,
    unreadOnly,
  })

  return jsonResponse({ threads })
})
