// POST /api/admin/sites/[siteId]/transfer — initiate a site transfer to a new owner
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { executeBatch, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { hashEmail, isReservedTestDomain, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { normalizeHost } from '~/server/utils/tenant-hosts'
import { rootDomainForPair } from '~/server/utils/domain-shared'
import { assertNewSalePlan, type NewSalePlanId } from '~/shared/billing-model'
import {
  buildTransferDomainSnapshot,
  cancelPendingSiteTransfer,
  serializeTransferDomainSnapshot,
} from '~/server/utils/site-transfer'
import { useRender } from 'vue-email'
import SiteTransferInvite from '~/server/emails/templates/SiteTransferInvite'
import { getOrgAdapter } from 'better-auth/plugins'

const TOKEN_BYTES = 32

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}


export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const site = await queryFirst<{ id: string; organization_id: string; brand_name: string | null }>(db, `
    SELECT id, organization_id, brand_name
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
    console.error('site_transfer_initiation_membership_check_failed', { siteId, userId, error })
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  let body: { email?: string; message?: string; plan?: unknown; coupon?: string; domain?: string; interval?: string }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const requestedPlan = typeof body.plan === 'string' ? body.plan.trim() : ''
  let invitedPlan: NewSalePlanId | null = null
  if (requestedPlan) {
    try {
      invitedPlan = assertNewSalePlan(requestedPlan)
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid plan' }, { status: 400 })
    }
  }
  const invitedInterval: 'month' | 'year' = body.interval === 'year' ? 'year' : 'month'
  const invitedCoupon = body.coupon?.trim() || null
  const invitedDomain = body.domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') || null
  const requiresPayment = Boolean(invitedPlan)

  if (invitedDomain && !invitedPlan) {
    return jsonResponse({ error: 'A custom-domain handoff requires a paid plan.' }, { status: 400 })
  }

  const toEmailRaw = body.email ?? ''
  if (typeof toEmailRaw !== 'string' || toEmailRaw !== toEmailRaw.trim() || toEmailRaw.trim() === '') {
    return jsonResponse({ error: 'A valid recipient email is required (no surrounding whitespace allowed)' }, { status: 400 })
  }
  const toEmail = toEmailRaw.trim().toLowerCase()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(toEmail)) {
    return jsonResponse({ error: 'A valid recipient email is required' }, { status: 400 })
  }
  // Reserved test domains (example.com, wa-verify@example.com, etc.) are guaranteed to
  // hard-bounce and must never be accepted where the environment sends real email.
  if (shouldSendRealEmail(env) && isReservedTestDomain(toEmail)) {
    return jsonResponse({ error: 'A valid recipient email is required' }, { status: 422 })
  }

  // Check for an identical pending request before touching any existing
  // transfer. The recipient conflict is intentionally preserved: an
  // identical invite remains payable/claimable rather than being replaced.
  const pendingTransfers = await queryAll<{
    id: string
    to_email: string
    custom_domains_removed_at: string | null
  }>(
    db,
    `SELECT id, to_email, custom_domains_removed_at
       FROM site_transfer_requests
      WHERE site_id = ? AND status = 'pending'
      ORDER BY created_at ASC`,
    [siteId],
  )

  const existingPending = (pendingTransfers || []).find(row => row.to_email.toLowerCase() === toEmail)
  if (existingPending) {
    return jsonResponse({ error: 'A pending transfer request to this email already exists.' }, { status: 409 })
  }

  // Every replacement must run the canonical cancellation saga first. This
  // is especially important for paid rows: cancelPendingSiteTransfer fences
  // the exact claim/session, expires any real Checkout, and restores paused
  // domains before the replacement can be inserted. A failed, ambiguous, or
  // completed payment leaves the prior request untouched and blocks this one.
  for (const pendingTransfer of pendingTransfers || []) {
    try {
      const cleanup = await cancelPendingSiteTransfer(env, db, pendingTransfer.id)
      if (!cleanup.cancelled) {
        return jsonResponse({
          error: pendingTransfer.custom_domains_removed_at
            ? 'An existing transfer changed while its custom-domain cleanup was pending. Retry after it settles.'
            : 'An existing transfer could not be safely cancelled. Retry after it settles.',
        }, { status: 409 })
      }
      const remainingMarker = await queryFirst<{
        status: string
        custom_domains_removed_at: string | null
      }>(db, `
        SELECT status, custom_domains_removed_at
          FROM site_transfer_requests
         WHERE id = ?
        LIMIT 1
      `, [pendingTransfer.id])
      if (!remainingMarker || remainingMarker.status === 'pending' || remainingMarker.custom_domains_removed_at) {
        return jsonResponse({ error: 'The existing transfer custom-domain cleanup is incomplete. Finish cleanup before replacing it.' }, { status: 409 })
      }
    } catch (error) {
      console.error('site_transfer_replacement_cleanup_failed', {
        transferId: pendingTransfer.id,
        siteId,
        error,
      })
      return jsonResponse({
        error: pendingTransfer.custom_domains_removed_at
          ? 'The existing transfer custom-domain cleanup is incomplete. Finish cleanup before replacing it.'
          : 'The existing transfer could not be safely cancelled. Retry after it settles.',
      }, { status: 409 })
    }
  }

  const id = crypto.randomUUID()
  const token = generateToken()
  const now = new Date()
  const domainSnapshot = requiresPayment
    ? await buildTransferDomainSnapshot(db, siteId)
    : []
  const customDomainsSnapshot = requiresPayment
    ? serializeTransferDomainSnapshot(domainSnapshot)
    : null

  if (invitedDomain) {
    const invitedDomainRoot = rootDomainForPair(invitedDomain)
    const hasInvitedDomain = domainSnapshot.some((entry) => rootDomainForPair(entry.domain) === invitedDomainRoot)
    if (!hasInvitedDomain) {
      return jsonResponse({ error: 'This site is not currently configured for that custom domain handoff.' }, { status: 400 })
    }
  }

  const batch: BatchQuery[] = [
    {
      query: `SELECT CASE WHEN EXISTS (
        SELECT 1 FROM site_transfer_requests
         WHERE site_id = ? AND status = 'pending'
      ) THEN json(?) ELSE NULL END`,
      params: [siteId, 'pending transfer appeared while the replacement was being prepared'],
    },
    {
      query: `INSERT INTO site_transfer_requests
       (id, site_id, from_organization_id, to_email, token, status, initiated_by_user_id, message,
        invited_plan, invited_coupon, invited_interval, invited_domain, requires_payment, created_at, custom_domains_snapshot)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        siteId,
        site.organization_id,
        toEmail,
        token,
        userId,
        body.message?.trim() ?? null,
        invitedPlan,
        invitedCoupon,
        invitedInterval,
        invitedDomain,
        requiresPayment ? 1 : 0,
        now.toISOString(),
        customDomainsSnapshot,
      ],
    },
  ]

  try {
    await executeBatch(db, batch)
  } catch (err) {
    const dbErr = err as Record<string, unknown>
    const msg = typeof dbErr.message === 'string' ? dbErr.message : ''
    const code = typeof dbErr.code === 'string' ? dbErr.code : ''
    if (msg.includes('malformed JSON')) {
      return jsonResponse({ error: 'The existing transfer cancellation cleanup is incomplete. Finish cleanup before replacing it.' }, { status: 409 })
    }
    if (msg.includes('UNIQUE') || msg.includes('constraint') || code === 'SQLITE_CONSTRAINT') {
      return jsonResponse({ error: 'A pending transfer request already exists for this site.' }, { status: 409 })
    }
    console.error('Site transfer transaction failed:', err)
    return jsonResponse({ error: 'Failed to initiate site transfer due to a database error.' }, { status: 500 })
  }

  const platformDomain = normalizeHost(env.NUXT_PUBLIC_PLATFORM_DOMAIN) || 'krabiclaw.com'
  const transferUrl = `https://${platformDomain}/transfer/${token}`
  const siteName = site.brand_name ?? siteId

  // Send invite email via Resend (best-effort — don't block the response)
  if (env.RESEND_API_KEY || !shouldSendRealEmail(env)) {
    const initiatorName = (session.user as { name?: string }).name || session.user.email || 'Your web designer'
    const planLabel: Record<NewSalePlanId, string> = {
      growth: 'Growth ($49/mo)',
    }
    const discountNote = invitedCoupon ? ' — a discount has been applied automatically at checkout' : ''
    const resolvedPlanLabel = invitedPlan ? `${planLabel[invitedPlan] ?? invitedPlan}${discountNote}` : null

    useRender(SiteTransferInvite, {
      props: {
        siteName,
        initiatorName,
        transferUrl,
        domain: invitedDomain ?? null,
        planLabel: resolvedPlanLabel,
        personalMessage: body.message?.trim() || null,
      },
    }).then(({ html, text }) => {
      if (shouldSendRealEmail(env)) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KrabiClaw <hello@krabiclaw.com>',
            to: [toEmail],
            subject: `${initiatorName} just built your new website! 🎉`,
            html,
            text,
          }),
        }).catch((err) => console.error('transfer_invite_email_failed', err))
      } else {
        console.info('email_delivery_log_only', {
          recipient: hashEmail(toEmail),
          siteId,
          organizationId: site.organization_id,
          template: 'site_transfer_invite',
          subject: `${initiatorName} just built your new website! 🎉`,
        })
      }
    }).catch((err) => console.error('transfer_invite_email_render_failed', err))
  }

  return jsonResponse({
    id,
    token,
    transfer_url: transferUrl,
    to_email: toEmail,
    site_name: siteName,
    invited_plan: invitedPlan,
    invited_coupon: invitedCoupon,
    invited_interval: invitedInterval,
    invited_domain: invitedDomain,
    requires_payment: requiresPayment,
  })
})
