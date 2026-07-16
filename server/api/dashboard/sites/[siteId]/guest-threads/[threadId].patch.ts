import { jsonResponse } from '~/server/utils/api-response'
import { getGuestThreadById, markGuestThreadSeen, updateGuestThreadInboxStatus, type GuestThreadInboxStatus } from '~/server/utils/guest-threads'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager'])

  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId: thread.location_id })

  const body = (await readBody(event).catch(() => null)) as { mark_seen?: unknown; inbox_status?: unknown } | null
  const markSeen = body?.mark_seen === true

  const VALID_INBOX_STATUSES = ['open', 'waiting_on_owner', 'waiting_on_guest', 'closed']
  let inboxStatus: GuestThreadInboxStatus | null = null
  if (body?.inbox_status !== undefined) {
    if (typeof body.inbox_status !== 'string' || !VALID_INBOX_STATUSES.includes(body.inbox_status)) {
      return jsonResponse({ error: 'Invalid inbox_status' }, { status: 400 })
    }
    inboxStatus = body.inbox_status as GuestThreadInboxStatus
  }

  if (markSeen) {
    await markGuestThreadSeen(db, threadId)
  }
  if (inboxStatus) {
    await updateGuestThreadInboxStatus(db, threadId, inboxStatus)
  }

  return jsonResponse({ success: true })
})
