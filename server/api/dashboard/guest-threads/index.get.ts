import { jsonResponse } from '~/server/utils/api-response'
import type { ConversationState, GuestThreadSubmissionType } from '~/server/domain/guest-threads/types'
import { loadOrganizationGuestThreads } from '~/server/utils/dashboard-guest-threads'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  const siteId = typeof query.site_id === 'string' && query.site_id.trim() ? query.site_id.trim() : null
  const locationId = typeof query.location_id === 'string' && query.location_id.trim() ? query.location_id.trim() : null
  const search = typeof query.search === 'string' ? query.search : null
  const type = query.type === 'contact' || query.type === 'reservation' || query.type === 'experience_booking'
    ? query.type as GuestThreadSubmissionType
    : null
  const conversationState = query.conversation_state === 'needs_attention' || query.conversation_state === 'waiting_on_guest' || query.conversation_state === 'resolved'
    ? query.conversation_state as ConversationState
    : null
  const unreadOnly = query.unread === '1' || query.unread === 'true'

  const payload = await loadOrganizationGuestThreads(event, {
    siteId, locationId, search, type, conversationState, unreadOnly, })
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-organization-guest-threads', payload))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';