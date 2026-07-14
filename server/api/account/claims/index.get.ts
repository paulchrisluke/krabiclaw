// Candidate customers rows the signed-in user's verified email could claim.
// Masked to organization/site name only — no booking PII — until the user
// explicitly initiates and verifies a claim (POST /api/account/claims).
import { jsonResponse } from '~/server/utils/api-response'
import { resolveClaimableCustomersForEvent } from '~/server/utils/account-surface'

export default defineEventHandler(async (event) => {
  const result = await resolveClaimableCustomersForEvent(event)
  if (result.status === 'db_unavailable') return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (result.status === 'unauthenticated') return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  return jsonResponse({ claimable: result.data })
})
