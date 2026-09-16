import { jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const submissionId = getRouterParam(event, 'submissionId')
  if (!siteId || !submissionId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { env, db, site, session } = await requireSiteAccess(event, siteId, 'context')
  const submission = await queryFirst<{ id: string; location_id: string }>(db, `
    SELECT rs.id, rs.location_id
    FROM requests rs
    WHERE rs.kind = 'reservation' AND rs.id = ? AND rs.site_id = ?
    LIMIT 1
  `, [submissionId, siteId])
  if (!submission) return jsonResponse({ error: 'Reservation not found or access denied' }, { status: 404 })

  await assertResourceAccess(db, { ...memberAccessPrincipal(site.membership, { env, siteId }), resourceLocationId: submission.location_id })

  const outcome = await executeGuestThreadOperation(db, { threadId: submissionId, siteId, action: 'complete', actorUserId: session.user.id, env, idempotencyKey: `manual-complete:${submissionId}` })
  if (!outcome.ok) return jsonResponse({ error: 'message' in outcome ? outcome.message : outcome.reason }, { status: outcome.status })
  await publishGuestInboxThreadEvent(env, db, { threadId: submissionId, type: 'thread.changed' })

  return jsonResponse({ completed: true, submission_id: submissionId })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
