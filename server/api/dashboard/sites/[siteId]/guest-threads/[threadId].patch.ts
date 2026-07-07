import { jsonResponse } from '~/server/utils/api-response'
import { getGuestThreadById, markGuestThreadSeen, updateGuestThreadInboxStatus, type GuestThreadInboxStatus } from '~/server/utils/guest-threads'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor'])

  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return jsonResponse({ error: 'Thread not found' }, { status: 404 })

  const body = await readBody(event) as { mark_seen?: unknown; inbox_status?: unknown }
  const markSeen = body.mark_seen === true
  const inboxStatus = body.inbox_status === 'open' || body.inbox_status === 'waiting_on_owner' || body.inbox_status === 'waiting_on_guest' || body.inbox_status === 'closed'
    ? body.inbox_status as GuestThreadInboxStatus
    : null

  if (markSeen) {
    await markGuestThreadSeen(db, threadId)
  }
  if (inboxStatus) {
    await updateGuestThreadInboxStatus(db, threadId, inboxStatus)
  }

  return jsonResponse({ success: true })
})
