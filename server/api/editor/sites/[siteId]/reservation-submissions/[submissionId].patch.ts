// PATCH /api/editor/sites/[siteId]/reservation-submissions/[submissionId]
//
// Delegates to the same canonical guest-thread operation service the dashboard inbox
// uses (issue #442 Locked Decision #4), so both surfaces share one state-mutation +
// ledger-append path rather than forking editor-specific logic.
import { cleanString, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'
import { reservationAdapter } from '~/server/domain/guest-threads/adapters/reservation'
import { ensureGuestThread } from '~/server/domain/guest-threads/repository'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { publishDashboardInvalidation } from '~/server/cloudflare/guest-inbox-events'

const STATUS_TO_ACTION = {
  confirmed: 'confirm', cancelled: 'cancel', completed: 'complete', } as const

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, env, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const submission = await queryFirst<{ location_id: string; status: string; updated_at: string }>(db, `SELECT location_id, status, updated_at FROM reservation_submissions WHERE id = ? AND site_id = ? LIMIT 1`, [submissionId, siteId])
  if (!submission) return jsonResponse({ error: 'Reservation not found' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: submission.location_id, })

  const body = await readBody(event) as { status?: unknown }
  const status = cleanString(body.status, 20)
  const action = (STATUS_TO_ACTION as Record<string, string>)[status]
  if (!action) {
    return jsonResponse({ error: 'Invalid status. Must be one of: confirmed, cancelled, completed' }, { status: 400 })
  }

  const thread = await ensureGuestThread(db, reservationAdapter, submissionId)

  const outcome = await executeGuestThreadOperation(db, {
    threadId: thread.id, siteId, action, actorUserId: session.user.id, env, idempotencyKey: `editor:reservation:${submissionId}:${submission.status}:${submission.updated_at}:${action}`, })

  if (!outcome.ok) {
    if (outcome.reason === 'thread_not_found' || outcome.reason === 'source_not_found') {
      return jsonResponse({ error: 'Reservation not found' }, { status: 404 })
    }
    if (outcome.reason === 'invalid_transition') {
      return jsonResponse({ error: outcome.message }, { status: 409 })
    }
    return jsonResponse({ error: 'Reservation update failed' }, { status: 400 })
  }

  await publishDashboardInvalidation(env, {
    eventId: crypto.randomUUID(), type: 'thread.changed', organizationId: outcome.thread.organization_id, siteId, locationId: outcome.thread.location_id, threadId: outcome.thread.id, occurredAt: new Date().toISOString(), })

  return jsonResponse({ updated: true, submission_id: submissionId, status })
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
