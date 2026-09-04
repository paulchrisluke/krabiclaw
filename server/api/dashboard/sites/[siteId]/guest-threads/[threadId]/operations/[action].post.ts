import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'

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
import { executeGuestThreadOperation, GUEST_THREAD_ACTIONS } from '~/server/domain/guest-threads/operations'
import { publishDashboardInvalidation } from '~/server/cloudflare/guest-inbox-events'

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

  const body = await readBody<unknown>(event).catch(() => null)
  const replyBody = body && typeof body === 'object' && 'body' in body && typeof body.body === 'string' ? body.body : undefined
  const deliveryId = body && typeof body === 'object' && 'deliveryId' in body && typeof body.deliveryId === 'string' ? body.deliveryId : undefined
  const headerKey = (event.req.headers.get('idempotency-key')) || (event.req.headers.get('x-idempotency-key'))
  const bodyKey = body && typeof body === 'object' && 'idempotencyKey' in body && typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined
  const idempotencyKey = bodyKey || headerKey || undefined

  if (!idempotencyKey) {
    return jsonResponse({ error: 'Idempotency key is required' }, { status: 400 })
  }

  const outcome = await executeGuestThreadOperation(db, {
    threadId,
    siteId,
    action,
    actorUserId: session.user.id,
    body: replyBody,
    deliveryId,
    idempotencyKey,
    env,
  })

  if (outcome.ok || outcome.reason === 'delivery_failed' || outcome.reason === 'delivery_unknown') {
    const changedThread = outcome.ok ? outcome.thread : thread
    const invalidations = [
      publishDashboardInvalidation(env, {
        eventId: crypto.randomUUID(),
        type: 'thread.changed',
        organizationId: changedThread.organization_id,
        siteId: changedThread.site_id,
        locationId: changedThread.location_id,
        threadId: changedThread.id,
        occurredAt: new Date().toISOString(),
      }),
    ]
    if (['reply', 'confirm', 'cancel', 'complete', 'retry_delivery'].includes(action)) {
      invalidations.push(publishDashboardInvalidation(env, {
        eventId: crypto.randomUUID(),
        type: 'delivery.changed',
        organizationId: changedThread.organization_id,
        siteId: changedThread.site_id,
        locationId: changedThread.location_id,
        threadId: changedThread.id,
        occurredAt: new Date().toISOString(),
      }))
    }
    const publication = Promise.all(invalidations).catch((error) => {
      console.error('Guest thread invalidation publication failed', error)
    })
    const waitUntil = getCloudflareWaitUntil(event)
    if (waitUntil) waitUntil(publication)
    else await publication
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
    if (outcome.reason === 'delivery_failed' || outcome.reason === 'delivery_unknown') {
      return jsonResponse({ error: outcome.message }, { status: outcome.status })
    }
    return jsonResponse({ error: 'Operation failed' }, { status: 400 })
  }

  const detail = await getGuestThreadDetail(db, threadId, siteId)
  return jsonResponse({ thread: detail, availableActions: outcome.availableActions })
})
