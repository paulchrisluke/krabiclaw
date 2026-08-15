// DELETE /api/admin/sites/[siteId]/transfer — cancel the pending transfer for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { cancelPendingSiteTransfer } from '~/server/utils/site-transfer'
import { getOrgAdapter } from 'better-auth/plugins'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT id, organization_id
    FROM sites
    WHERE id = ?
    LIMIT 1
  `, [siteId])

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  // Better Auth owns organization membership. Platform control-plane access is
  // intentionally not a tenant-owner bypass for this mutation.
  try {
    const auth = createAuth(env)
    const context = await auth.$context
    const member = await getOrgAdapter(
      context as Parameters<typeof getOrgAdapter>[0],
      {},
    ).findMemberByOrgId({ userId, organizationId: site.organization_id })
    const memberRecord = member && typeof member === 'object'
      ? member as { userId?: unknown; organizationId?: unknown; role?: unknown }
      : null
    const role = typeof memberRecord?.role === 'string' ? memberRecord.role : null
    if (memberRecord?.userId !== userId
      || memberRecord.organizationId !== site.organization_id
      || (role !== 'owner' && role !== 'admin')) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }
  } catch (error) {
    console.error('site_transfer_cancellation_membership_check_failed', { siteId, userId, error })
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const transfer = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM site_transfer_requests
    WHERE site_id = ?
      AND (status = 'pending' OR (status = 'cancelled' AND custom_domains_removed_at IS NOT NULL))
    ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `, [siteId])

  if (!transfer) return jsonResponse({ error: 'No pending transfer found' }, { status: 404 })

  let result: Awaited<ReturnType<typeof cancelPendingSiteTransfer>>
  try {
    result = await cancelPendingSiteTransfer(env, db, transfer.id)
  } catch (error) {
    console.error('site_transfer_cancellation_failed', {
      transferId: transfer.id,
      siteId,
      error,
    })
    return jsonResponse({ error: 'The handoff could not be cancelled safely. Retry after provider reconciliation.' }, { status: 502 })
  }
  if (!result.cancelled) {
    if (result.reason === 'payment_completed') {
      return jsonResponse({ error: 'Checkout completed; wait for the payment webhook to finish this handoff.' }, { status: 409 })
    }
    return jsonResponse({ error: 'No pending transfer found, or another operation won the cancellation race.' }, { status: 409 })
  }

  return jsonResponse({ cancelled: true, custom_domains_deleted: result.customDomainsDeleted })
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
