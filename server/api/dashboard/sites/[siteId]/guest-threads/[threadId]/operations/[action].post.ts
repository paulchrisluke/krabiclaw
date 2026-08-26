import { HTTPError, defineHandler  } from 'nitro';

// POST /api/dashboard/sites/[siteId]/guest-threads/[threadId]/operations/[action]
//
// Canonical guest-thread operation endpoint (issue #442 Locked Decision #8). Every
// state-mutating guest-thread action — confirm/cancel/complete/resolve/reopen/reply —
// flows through here. The inbox must never call source-specific editor endpoints
// directly.
import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope } from '~/server/utils/member-access'
import { getCloudflareWaitUntil } from '~/server/utils/mcp-route-helpers'
import { getGuestThreadById } from '~/server/domain/guest-threads/repository'
import { getGuestThreadDetail } from '~/server/domain/guest-threads/detail'
import { GUEST_THREAD_ACTIONS, type OperationOutcome } from '~/server/domain/guest-threads/operations'
import { publishPendingGuestDeliveryOutbox, type GuestDeliveryQueueEnv } from '~/server/domain/guest-threads/outbox-publisher'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const threadId = getRouterParam(event, 'threadId')
  const action = getRouterParam(event, 'action')
  if (!siteId || !threadId || !action) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  if (!GUEST_THREAD_ACTIONS.has(action)) return jsonResponse({ error: `Unknown action "${action}"` }, { status: 400 })

  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')

  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) return jsonResponse({ error: 'Thread not found' }, { status: 404 })
  await assertMemberScope(db, { env, memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, locationId: thread.location_id })

  const body = (await readBody(event).catch(() => null)) as { body?: unknown; deliveryId?: unknown; idempotencyKey?: unknown } | null
  const replyBody = typeof body?.body === 'string' ? body.body : undefined
  const deliveryId = typeof body?.deliveryId === 'string' ? body.deliveryId : undefined
  const headerKey = (event.req.headers.get('idempotency-key')) || (event.req.headers.get('x-idempotency-key'))
  const bodyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : undefined
  const idempotencyKey = bodyKey || headerKey || undefined

  if (!idempotencyKey) {
    return jsonResponse({ error: 'Idempotency key is required' }, { status: 400 })
  }

  const commandNamespace = env.GUEST_THREAD_COMMANDS
  if (!commandNamespace) {
    throw new HTTPError({ statusCode: 503, message: 'Guest thread command binding is not configured' })
  }

  const command = await commandNamespace.get(commandNamespace.idFromName(threadId)).fetch(
    new Request('https://guest-thread-command.internal/execute', {
      method: 'POST', headers: {
        'content-type': 'application/json', 'x-krabiclaw-site-id': siteId, 'x-krabiclaw-member-id': site.member_id, 'x-krabiclaw-user-id': session.user.id, }, body: JSON.stringify({
        threadId, siteId, action, actorUserId: session.user.id, actorMemberId: site.member_id, body: replyBody, deliveryId, idempotencyKey, expectedThreadVersion: thread.version, }), }), )
  const outcome = await command.json() as OperationOutcome

  if (!command.ok) {
    throw new HTTPError({ statusCode: command.status, message: 'Guest thread command failed' })
  }

  if (!outcome || typeof outcome !== 'object' || !('ok' in outcome)) {
    throw new HTTPError({ statusCode: 502, message: 'Invalid guest thread command response' })
  }

  if (outcome.ok === false) {
    if (outcome.reason === 'thread_not_found' || outcome.reason === 'source_not_found' || outcome.reason === 'delivery_not_found') {
      return jsonResponse({ error: 'Thread not found' }, { status: 404 })
    }
    if (outcome.reason === 'invalid_transition') {
      return jsonResponse({ error: outcome.message }, { status: 409 })
    }
    if (outcome.reason === 'no_guest_email') {
      return jsonResponse({ error: 'This guest has no email on file' }, { status: 400 })
    }
    if (outcome.reason === 'empty_body') {
      return jsonResponse({ error: 'Reply body is required' }, { status: 400 })
    }
    if (outcome.reason === 'missing_idempotency_key') {
      return jsonResponse({ error: 'Idempotency key is required' }, { status: 400 })
    }
    return jsonResponse({ error: 'Operation failed' }, { status: 400 })
  }

  const publishOutbox = publishPendingGuestDeliveryOutbox(db, env as GuestDeliveryQueueEnv, 10).catch((error) => {
    console.warn('[guest-threads] delivery outbox publish skipped after committed operation', error)
  })
  getCloudflareWaitUntil(event)?.(publishOutbox)

  const detail = await getGuestThreadDetail(db, threadId, siteId, site.member_id)
  return jsonResponse({ thread: detail, availableActions: outcome.availableActions })
})
import {  getRouterParam , readBody  } from 'nitro/h3';
