import { jsonResponse } from '~/server/utils/api-response'
import { getGuestThreadDetail, markGuestThreadSeen } from '~/server/utils/guest-threads'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope } from '~/server/utils/member-access'

function openingTimelineItem(detail: NonNullable<Awaited<ReturnType<typeof getGuestThreadDetail>>>) {
  const { thread, source } = detail
  if (source.submission_type === 'contact') {
    return {
      id: `opening-${thread.id}`,
      type: 'message',
      role: 'guest',
      channel: 'web',
      body: source.message,
      createdAt: source.created_at,
      synthetic: true,
      label: 'Website message',
    }
  }

  return {
    id: `opening-${thread.id}`,
    type: 'event',
    role: 'system',
    body: source.submission_type === 'reservation' ? 'Reservation request received' : 'Experience booking request received',
    createdAt: source.created_at,
    synthetic: true,
  }
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager'])
  const detail = await getGuestThreadDetail(db, threadId, siteId)
  if (!detail) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId: detail.thread.location_id })

  const timeline = [
    openingTimelineItem(detail),
    ...detail.messages.map(message => ({
      id: message.id,
      type: 'message',
      role: message.direction === 'in' ? 'guest' : 'owner',
      channel: message.channel,
      body: message.body,
      createdAt: message.created_at,
      status: message.status,
      error: message.error,
      synthetic: false,
    })),
  ]

  try {
    await markGuestThreadSeen(db, threadId)
  } catch (error) {
    console.error('mark_guest_thread_seen_failed', {
      threadId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return jsonResponse({
    thread: {
      ...detail.thread,
      unread_count: 0,
    },
    source: detail.source,
    timeline,
  })
})
