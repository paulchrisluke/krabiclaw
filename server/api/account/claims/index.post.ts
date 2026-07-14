// Step 1 of the explicit guest claim flow: the signed-in user requests to link a
// specific candidate customers row. This never links the account by itself — it
// only issues a single-use, time-limited verification email distinct from Better
// Auth's own signup verification. See
// docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
import { readBody } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createClaimRequest } from '~/server/utils/guest-claims'
import { sendGuestClaimVerificationEmail } from '~/server/utils/auth-email'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!session.user.emailVerified) {
    return jsonResponse({ error: 'Verify your account email before claiming booking history.' }, { status: 403 })
  }

  const body = await readBody<{ customerId?: string }>(event).catch(() => null)
  const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : ''
  if (!customerId) return jsonResponse({ error: 'customerId is required' }, { status: 400 })

  const result = await createClaimRequest(db, {
    customerId,
    userId: session.user.id,
    userEmail: session.user.email,
  })

  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 409
    return jsonResponse({ error: result.reason }, { status })
  }

  const site = await queryFirst<{ brand_name: string | null, slug: string }>(db, `
    SELECT s.brand_name, s.slug
    FROM customers c
    JOIN sites s ON s.id = c.site_id
    WHERE c.id = ?
    LIMIT 1
  `, [customerId])

  const platformDomain = (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const verifyUrl = `https://${platformDomain}/account/claims/verify?token=${result.rawToken}`

  try {
    await sendGuestClaimVerificationEmail(env, {
      email: session.user.email,
      verifyUrl,
      siteName: site?.brand_name || site?.slug || 'this site',
    })
  } catch (error) {
    // The claim row already exists (pending, with a live token) — don't report
    // success when the user was never actually emailed a way to verify it.
    // Re-requesting the claim rotates the token and retries the send.
    console.error('guest_claim_email_failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonResponse({ error: 'Could not send the verification email. Please try again.' }, { status: 502 })
  }

  return jsonResponse({ ok: true, claimId: result.claimId })
})
