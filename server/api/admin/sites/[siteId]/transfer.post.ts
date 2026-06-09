// POST /api/admin/sites/[siteId]/transfer — initiate a site transfer to a new owner
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { rootDomainForPair } from '~/server/utils/domains'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import {
  buildTransferDomainSnapshot,
  serializeTransferDomainSnapshot,
} from '~/server/utils/site-transfer'

const ALLOWED_PLANS = ['growth', 'managed', 'seo_accelerator']
const TOKEN_BYTES = 32

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const isPlatAdmin = isPlatformOwner(session.user.email, env)

  // Verify caller is platform admin or an owner/admin of this site
  const site = await db
    .prepare(
      isPlatAdmin
        ? `SELECT s.id, s.organization_id, s.brand_name FROM sites s WHERE s.id = ? LIMIT 1`
        : `SELECT s.id, s.organization_id, s.brand_name FROM sites s
           JOIN member m ON m.organizationId = s.organization_id
           WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin') LIMIT 1`,
    )
    .bind(...(isPlatAdmin ? [siteId] : [siteId, userId]))
    .first<{ id: string; organization_id: string; brand_name: string | null }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: { email?: string; message?: string; plan?: string; coupon?: string; domain?: string }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const invitedPlan = body.plan?.trim() || null
  if (invitedPlan && !ALLOWED_PLANS.includes(invitedPlan)) {
    return jsonResponse({ error: `Invalid plan. Allowed: ${ALLOWED_PLANS.join(', ')}` }, { status: 400 })
  }
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

  // Check for identical pending request to avoid double-submission
  const existingPending = await db
    .prepare(
      `SELECT id FROM site_transfer_requests
       WHERE site_id = ? AND to_email = ? AND status = 'pending' LIMIT 1`,
    )
    .bind(siteId, toEmail)
    .first<{ id: string }>()

  if (existingPending) {
    return jsonResponse({ error: 'A pending transfer request to this email already exists.' }, { status: 409 })
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

  const cancelStmt = db.prepare(
    `UPDATE site_transfer_requests SET status = 'cancelled'
     WHERE site_id = ? AND status = 'pending'`,
  ).bind(siteId)

  const insertStmt = db.prepare(
    `INSERT INTO site_transfer_requests
     (id, site_id, from_organization_id, to_email, token, status, initiated_by_user_id, message,
      invited_plan, invited_coupon, invited_domain, requires_payment, created_at, custom_domains_snapshot)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    siteId,
    site.organization_id,
    toEmail,
    token,
    userId,
    body.message?.trim() ?? null,
    invitedPlan,
    invitedCoupon,
    invitedDomain,
    requiresPayment ? 1 : 0,
    now.toISOString(),
    customDomainsSnapshot,
  )

  try {
    await db.batch([cancelStmt, insertStmt])
  } catch (err) {
    const dbErr = err as Record<string, unknown>
    const msg = typeof dbErr.message === 'string' ? dbErr.message : ''
    const code = typeof dbErr.code === 'string' ? dbErr.code : ''
    if (msg.includes('UNIQUE') || msg.includes('constraint') || code === 'SQLITE_CONSTRAINT') {
      return jsonResponse({ error: 'A pending transfer request already exists for this site.' }, { status: 409 })
    }
    console.error('Site transfer transaction failed:', err)
    return jsonResponse({ error: 'Failed to initiate site transfer due to a database error.' }, { status: 500 })
  }

  const platformDomain = env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'krabiclaw.com'
  const transferUrl = `https://${platformDomain}/transfer/${token}`
  const siteName = site.brand_name ?? siteId

  // Send invite email via Resend (best-effort — don't block the response)
  if (env.RESEND_API_KEY) {
    const initiatorName = (session.user as { name?: string }).name || session.user.email || 'Your web designer'
    const planLabel: Record<string, string> = {
      growth: 'Growth ($49/mo)',
      managed: 'Managed ($149/mo)',
      seo_accelerator: 'SEO Accelerator ($349/mo)',
    }
    const discountNote = invitedCoupon ? ' — a discount has been applied automatically at checkout' : ''
    const planLine = invitedPlan
      ? `<p style="margin:8px 0 0"><strong>Recommended plan:</strong> ${planLabel[invitedPlan] ?? invitedPlan}${discountNote}</p>`
      : ''
    const personalNote = body.message?.trim()
      ? `<p style="font-style:italic;color:#71717a;margin:16px 0">"${escapeHtml(body.message.trim())}"</p>`
      : ''

    const domainLine = invitedDomain
      ? `<p style="margin:8px 0 0"><strong>Your domain:</strong> ${escapeHtml(invitedDomain)} — already set up, no extra hosting needed</p>`
      : ''

    const html = `
      <p>Hi there,</p>
      <p><strong>${escapeHtml(initiatorName)}</strong> has built your website and it's ready for you to claim.</p>
      <div style="border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0"><strong>Website:</strong> ${escapeHtml(siteName)}</p>
        <p style="margin:8px 0 0"><strong>Live preview:</strong> <a href="https://${escapeHtml(invitedDomain ?? platformDomain)}" style="color:#8F1D21">View your live site</a></p>
        ${domainLine}
        ${planLine}
      </div>
      ${personalNote}
      <p>Click the button below to sign in and take ownership of your site. You only pay once you've had a look around and you're happy.</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(transferUrl)}" style="background:#FB7461;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Claim your website</a>
      </p>
      <p style="font-size:12px;color:#71717a">This transfer link will stay active until you're ready to claim it. Didn't expect this email? No worries, you can safely ignore it.</p>
    `

    const textParts = [
      'Hi there,',
      '',
      `${initiatorName} has built your website (${siteName}) and it's ready to claim.`,
    ]
    if (invitedDomain) textParts.push('', `Your domain: ${invitedDomain} — already set up, no extra hosting needed`)
    if (personalNote) textParts.push('', `"${body.message!.trim()}"`)
    if (invitedPlan) textParts.push('', `Recommended plan: ${planLabel[invitedPlan] ?? invitedPlan}${discountNote}`)
    if (requiresPayment) {
      textParts.push('', 'Checkout comes before ownership transfer on paid handoffs.')
    }
    textParts.push('', `Claim your website: ${transferUrl}`, '', `This transfer link will stay active until you're ready to claim it. Didn't expect this email? No worries, you can safely ignore it.`)

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KrabiClaw <hello@krabiclaw.com>',
        to: [toEmail],
        subject: `${initiatorName} just built your new website! 🎉`,
        html,
        text: textParts.join('\n'),
      }),
    }).catch((err) => console.error('transfer_invite_email_failed', err))
  }

  return jsonResponse({
    id,
    token,
    transfer_url: transferUrl,
    to_email: toEmail,
    site_name: siteName,
    invited_plan: invitedPlan,
    invited_coupon: invitedCoupon,
    invited_domain: invitedDomain,
    requires_payment: requiresPayment,
  })
})
