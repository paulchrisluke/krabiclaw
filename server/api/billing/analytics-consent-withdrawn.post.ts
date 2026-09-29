import { defineHandler } from 'nitro'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getStripe } from '~/server/utils/billing'
import { withdrawStripeGaIdentifiers } from '~/server/utils/stripe-ga4'

// The visitor withdrew (or never gave) analytics consent: erase every GA identifier stored for
// their billing. Without a session nothing of theirs is stored, so there is nothing to erase.
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ success: true, erased: false })
  await withdrawStripeGaIdentifiers(env.DB, () => getStripe(env), session.user.id)
  return jsonResponse({ success: true, erased: true })
})
