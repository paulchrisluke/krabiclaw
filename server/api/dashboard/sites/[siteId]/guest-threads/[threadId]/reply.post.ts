import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { getGuestThreadById, postGuestThreadReply } from '~/server/utils/guest-threads'
import { assertMemberScope } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  if (!siteId || !threadId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin', 'editor', 'location_manager'])
  const body = (await readBody(event).catch(() => null)) as { channel?: unknown; body?: unknown } | null
  const channel = body?.channel
  const replyBody = typeof body?.body === 'string' ? body.body.trim() : ''
  if (channel !== 'email') {
    return jsonResponse({ error: 'Guest thread replies are email-only in v1' }, { status: 400 })
  }
  if (!replyBody) {
    return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
  }

  // assertMemberScope needs the thread's location_id, which requires a lookup before
  // the shared postGuestThreadReply call (which deliberately does not re-check access).
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  await assertMemberScope(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId: thread.location_id })

  const result = await postGuestThreadReply(db, env, {
    threadId,
    siteId,
    senderUserId: session.user.id,
    body: replyBody,
  })

  if (!result.ok) {
    if (result.reason === 'thread_not_found') return jsonResponse({ error: 'Thread not found' }, { status: 404 })
    if (result.reason === 'no_guest_email') return jsonResponse({ error: 'This guest has no email on file' }, { status: 400 })
    if (result.reason === 'empty_body') return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
    if (result.reason === 'send_failed') {
      return jsonResponse({ error: result.error, persisted: result.persisted }, { status: 502 })
    }
    return jsonResponse({ error: 'Failed to send reply' }, { status: 500 })
  }

  if (result.status === 207) {
    return jsonResponse({ sent: true, persisted: false, error: result.error }, { status: 207 })
  }

  return jsonResponse({ sent: true, persisted: true, ...(result.duplicate ? { duplicate: true } : {}) })
})
