// Candidate customers rows the signed-in user's verified email could claim.
// Masked to organization/site name only — no booking PII — until the user
// explicitly initiates and verifies a claim (POST /api/account/claims).
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { findClaimableCustomersForEmail } from '~/server/utils/guest-claims'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!session.user.emailVerified) return jsonResponse({ claimable: [] })

  const claimable = await findClaimableCustomersForEmail(db, session.user.email)
  return jsonResponse({ claimable })
})
