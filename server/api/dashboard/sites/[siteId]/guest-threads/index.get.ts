import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listGuestThreads, getGuestThreadOperationSummary } from '~/server/domain/guest-threads/repository'
import type { ConversationState, GuestThreadSubmissionType } from '~/server/domain/guest-threads/types'
import { assertMemberScope } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id.trim() ? query.location_id.trim() : null
  if (locationId) {
    await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId })
  }
  const search = typeof query.search === 'string' ? query.search : null
  const type = query.type === 'contact' || query.type === 'reservation' || query.type === 'experience_booking'
    ? query.type as GuestThreadSubmissionType
    : null
  const conversationState = query.conversation_state === 'needs_attention' || query.conversation_state === 'waiting_on_guest' || query.conversation_state === 'resolved'
    ? query.conversation_state as ConversationState
    : null
  const unreadOnly = query.unread === '1' || query.unread === 'true'

  const principal = { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
  const opts = {
    locationId,
    principal,
    memberId: site.member_id,
    search,
    type,
    conversationState,
    unreadOnly,
  }

  const [threads, summary] = await Promise.all([
    listGuestThreads(db, siteId, opts),
    getGuestThreadOperationSummary(db, siteId, opts),
  ])

  return jsonResponse({ threads, summary })
})
