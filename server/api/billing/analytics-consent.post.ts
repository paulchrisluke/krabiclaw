import { defineHandler } from 'nitro'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe } from '~/server/utils/billing'
import { readAnalyticsConsent } from '~/server/utils/ga4-delivery'
import { withdrawStripeGaIdentifiers } from '~/server/utils/stripe-ga4'

// Reconciles the visitor's CURRENT analytics decision with what billing has stored for them. The
// decision is read from this request's own consent cookie, never from the caller's claim. Anything
// but "accepted" erases every GA identifier stored for the signed-in user's billing. Without a
// session nothing is erased and the caller asks again once billing resumes authenticated.
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
  if (readAnalyticsConsent(event.req.headers.get('cookie') ?? '') === 'accepted') return jsonResponse({ success: true, erased: false, reason: 'accepted' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ success: true, erased: false, reason: 'no_session' })
  await withdrawStripeGaIdentifiers(env.DB, () => getStripe(env), session.user.id)
  return jsonResponse({ success: true, erased: true })
})
