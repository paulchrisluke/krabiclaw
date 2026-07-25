import { jsonResponse } from '~/server/utils/api-response'
import { getGuestThreadDetail } from '~/server/domain/guest-threads/detail'
import { getGuestThreadById } from '~/server/domain/guest-threads/repository'
import { advanceMemberCursor } from '~/server/domain/guest-threads/read-state'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId: thread.location_id })

  const detail = await getGuestThreadDetail(db, threadId, siteId, site.member_id)
  if (!detail) return jsonResponse({ error: 'Thread not found' }, { status: 404 })

  // Advances only the requesting member's own read cursor — opening a thread must never
  // mark it read for any other authorized member (issue #442 Locked Decision #10).
  try {
    const latest = detail.entries[detail.entries.length - 1]
    if (latest) await advanceMemberCursor(db, threadId, site.member_id, latest.id)
  } catch (error) {
    console.error('advance_member_cursor_failed', {
      threadId,
      memberId: site.member_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return jsonResponse({ thread: detail })
})
