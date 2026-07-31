// DELETE /api/admin/sites/[siteId]/transfer — cancel the pending transfer for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { cancelPendingSiteTransfer } from '~/server/utils/site-transfer'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const isPlatAdmin = await hasPlatformEventPermission(event, env, { platform: ['organizations'] })

  const site = await queryFirst<{ id: string }>(
    db,
    isPlatAdmin
      ? `SELECT id FROM sites WHERE id = ? LIMIT 1`
      : `SELECT s.id FROM sites s
         JOIN member m ON m.organizationId = s.organization_id
         WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin') LIMIT 1`,
    isPlatAdmin ? [siteId] : [siteId, userId],
  )

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const transfer = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM site_transfer_requests
    WHERE site_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `, [siteId])

  if (!transfer) return jsonResponse({ error: 'No pending transfer found' }, { status: 404 })

  const result = await cancelPendingSiteTransfer(env, db, transfer.id)
  if (!result.cancelled) return jsonResponse({ error: 'No pending transfer found' }, { status: 404 })

  return jsonResponse({ cancelled: true, custom_domains_deleted: result.customDomainsDeleted })
})
