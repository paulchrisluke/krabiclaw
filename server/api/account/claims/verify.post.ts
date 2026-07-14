// Step 2 of the explicit guest claim flow: the user has clicked the emailed
// claim-verification link. Only this call actually sets customers.user_id.
import { readBody } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { verifyClaimToken } from '~/server/utils/guest-claims'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody<{ token?: string }>(event).catch(() => null)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return jsonResponse({ error: 'token is required' }, { status: 400 })

  const result = await verifyClaimToken(db, token, session.user.id)
  if (!result.ok) {
    const status = result.reason === 'already_claimed_by_other'
      ? 409
      : result.reason === 'token_user_mismatch'
        ? 403
        : 400
    return jsonResponse({ error: result.reason }, { status })
  }

  return jsonResponse({ ok: true, customerId: result.customerId })
})
