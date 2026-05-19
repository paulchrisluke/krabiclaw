// POST /api/site-transfer/[token]/accept — authenticated: accept and execute a site transfer
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { executeSiteTransfer } from '~/server/utils/site-transfer'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const userEmail = session.user.email?.toLowerCase() ?? ''
  const isPlatAdmin = isPlatformOwner(session.user.email, env)

  const transfer = await db
    .prepare(
      `SELECT id, site_id, from_organization_id, to_email, status, expires_at
       FROM site_transfer_requests WHERE token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
      id: string
      site_id: string
      from_organization_id: string
      to_email: string
      status: string
      expires_at: string
    }>()

  if (!transfer) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (transfer.status !== 'pending') {
    return jsonResponse(
      { error: `Transfer is already ${transfer.status}` },
      { status: 410 },
    )
  }

  if (new Date(transfer.expires_at) < new Date()) {
    await db
      .prepare(`UPDATE site_transfer_requests SET status = 'expired' WHERE id = ?`)
      .bind(transfer.id)
      .run()
    return jsonResponse({ error: 'Transfer has expired' }, { status: 410 })
  }

  // Only the intended recipient or a platform admin may accept
  if (!isPlatAdmin && userEmail !== transfer.to_email.toLowerCase()) {
    return jsonResponse(
      { error: `This transfer was sent to ${transfer.to_email}. Please sign in with that account.` },
      { status: 403 },
    )
  }

  // Find the accepting user's owner org (created automatically on signup)
  const ownerMember = await db
    .prepare(
      `SELECT organizationId FROM member WHERE userId = ? AND role = 'owner' LIMIT 1`,
    )
    .bind(userId)
    .first<{ organizationId: string }>()

  if (!ownerMember) {
    return jsonResponse(
      { error: 'Your account does not have an owner organization. Please contact support.' },
      { status: 422 },
    )
  }

  const toOrgId = ownerMember.organizationId

  if (toOrgId === transfer.from_organization_id) {
    return jsonResponse({ error: 'You already own this site' }, { status: 422 })
  }

  await executeSiteTransfer(
    db,
    transfer.site_id,
    transfer.from_organization_id,
    toOrgId,
    transfer.id,
    userId,
  )

  return jsonResponse({ success: true, site_id: transfer.site_id })
})
