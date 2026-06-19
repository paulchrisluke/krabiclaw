// POST /api/admin/sites/[siteId]/transfer/force-accept
// Admin-only: execute a pending transfer without Stripe checkout (for cash payments)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { executeSiteTransfer } from '~/server/utils/site-transfer'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  // Find the pending transfer for this site
  const transfer = await db.prepare(`
    SELECT id, site_id, from_organization_id, to_email, status, requires_payment
    FROM site_transfer_requests
    WHERE site_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(siteId).first<{
    id: string
    site_id: string
    from_organization_id: string
    to_email: string
    status: string
    requires_payment: number
  }>()

  if (!transfer) return jsonResponse({ error: 'No pending transfer found for this site.' }, { status: 404 })

  // Find the recipient's account — they must have signed up first and be an org owner
  // Assumes recipients are single-org owners (acceptable for manual admin oversight)
  const recipient = await db.prepare(`
    SELECT u.id AS user_id, m.organizationId AS org_id
    FROM user u
    JOIN member m ON m.userId = u.id AND m.role = 'owner'
    WHERE lower(u.email) = ?
    LIMIT 1
  `).bind(transfer.to_email.toLowerCase()).first<{ user_id: string; org_id: string }>()

  if (!recipient) {
    return jsonResponse({
      error: `${transfer.to_email} has not created an account yet. Ask them to click the transfer link and sign up first.`,
    }, { status: 422 })
  }

  if (recipient.org_id === transfer.from_organization_id) {
    return jsonResponse({ error: 'Recipient already owns this site.' }, { status: 422 })
  }

  // Guard check: if transfer requires payment, ensure recipient has active billing subscription
  if (transfer.requires_payment === 1) {
    const billingCheck = await db.prepare(`
      SELECT id FROM organization_billing
      WHERE organization_id = ? AND status = 'active'
      LIMIT 1
    `).bind(recipient.org_id).first<{ id: string }>()

    if (!billingCheck) {
      return jsonResponse({
        error: 'This transfer requires payment. The recipient must have an active billing subscription before the transfer can proceed.',
      }, { status: 402 })
    }
  }

  await executeSiteTransfer(
    db,
    transfer.site_id,
    transfer.from_organization_id,
    recipient.org_id,
    transfer.id,
    recipient.user_id,
  )

  return jsonResponse({
    success: true,
    site_id: transfer.site_id,
    transferred_to_org: recipient.org_id,
    to_email: transfer.to_email,
  })
})
