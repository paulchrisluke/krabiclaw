// GET /api/admin/sites/[siteId]/transfer — fetch the pending transfer for a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const isPlatAdmin = isPlatformOwner(session.user.email, env)

  const site = await db
    .prepare(
      isPlatAdmin
        ? `SELECT id FROM sites WHERE id = ? LIMIT 1`
        : `SELECT s.id FROM sites s
           JOIN member m ON m.organizationId = s.organization_id
           WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin') LIMIT 1`,
    )
    .bind(...(isPlatAdmin ? [siteId] : [siteId, userId]))
    .first<{ id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const transfer = await db
    .prepare(
      `SELECT id, to_email, status, created_at, completed_at,
              requires_payment, reminder_count, last_reminder_at, custom_domains_removed_at
       FROM site_transfer_requests
       WHERE site_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(siteId)
    .first<{
      id: string
      to_email: string
      status: string
      created_at: string
      completed_at: string | null
      requires_payment: number
      reminder_count: number | null
      last_reminder_at: string | null
      custom_domains_removed_at: string | null
    }>()

  if (!transfer) return jsonResponse({ pending: null })

  return jsonResponse({ pending: transfer })
})
